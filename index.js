import PogObject from "../PogData";
import request from "../requestV2";

const S02PacketChat = Java.type("net.minecraft.network.play.server.S02PacketChat");
const S32PacketConfirmTransaction = Java.type("net.minecraft.network.play.server.S32PacketConfirmTransaction");
const C0EPacketClickWindow = Java.type("net.minecraft.network.play.client.C0EPacketClickWindow");
const File = Java.type("java.io.File");

const playerData = {};
const namesToUUID = {};
const tabCompleteNames = new Set();

const data = new PogObject("bigtracker", {
    firstTime: true,
    autoKick: false,
    sayReason: false,
    autoStartSession: true,
    nameHistory: 0
}, "settings.json");

const runData = new PogObject("bigtracker", {
    chests: {}
}, "bigloot.json");


const getFileTabCompleteNames = () => {
    new Thread( () => {
        let fileNames = new File("./config/ChatTriggers/modules/bigtracker/bigplayers").list();
        if (fileNames == null) return;
        for (let i = 0; i < fileNames.length; i++) {
            let player = new BigPlayer(fileNames[i].replace(".json", ""));
            tabCompleteNames.add(player.playerData["USERNAME"]);
        }
    }).start();
}


const getPlayerByName = (name, task=null, extra=null) => {
    name = name?.toLowerCase();

    if (!name || name?.trim() == "") {
        return;
    }
    
    if (namesToUUID?.[name] && playerData[namesToUUID[name]]) {
        playerData[namesToUUID[name]].doTask(task, extra);
        return;
    }

    request(`https://api.mojang.com/users/profiles/minecraft/${name}`)
        .then(function(res) {
            const UUID = JSON.parse(res)?.id;
            NAME = JSON.parse(res)?.name?.toLowerCase();
            namesToUUID[name] = UUID;
            tabCompleteNames.add(NAME);

            let player = new BigPlayer(UUID, NAME);
            player.doTask(task, extra);
            playerData[UUID] = player;
        }
    );
}


register("worldLoad", () => {
    tick.reset();
    ChatHandler.dungeon = null;
    ChatHandler.getLoot = false;
    ChatHandler.lastGuiName = "";
});


class ChatHandler {
    static dungeon = null;
    static getLoot = false;
    static lastGuiName = "";

    static runText(text) {
        // yes this is supposed to write the type of chest reward to the file because why not.
        if (text.match(/\s+(WOOD|GOLD|DIAMOND|EMERALD|OBSIDIAN|BEDROCK) CHEST REWARDS/)) {
            ChatHandler.getLoot = true;

            if (ChatHandler.lastGuiName == "" && ChatHandler.dungeon != null) {
                ChatHandler.lastGuiName = Utils.fakeLastGuiName();
            }

            if (ChatHandler.lastGuiName == "") {
                console.log("bigtracker > an error occured logging chest loot");
                return;
            }

            if (!runData["chests"]?.[ChatHandler.lastGuiName]) {
                runData["chests"][ChatHandler.lastGuiName] = {
                    Total: 0
                };
            }

            runData["chests"][ChatHandler.lastGuiName]["Total"] += 1;
        }
        
        if (ChatHandler.getLoot) {
            if (text.trim() == "") {
                ChatHandler.getLoot = false;
                ChatHandler.writeToFloor = null;
                runData.save();
                return;
            }
            if (text.match(/.+Essence x(\d+)/)) {
                let amt = parseInt(text.match(/.+Essence x(\d+)/)[1]);
                let type = text.match(/(.+ Essence) x.+/)[1].trim();
                runData["chests"][ChatHandler.lastGuiName][type] = (runData["chests"][ChatHandler.lastGuiName][type] || 0) + amt;
                if (BigCommand.dungeonSession != null) {
                    BigCommand.dungeonSession.loot[type] = (BigCommand.dungeonSession.loot[type] || 0) + amt;
                }
            } else {
                text = text.trim();
                runData["chests"][ChatHandler.lastGuiName][text] = (runData["chests"][ChatHandler.lastGuiName][text] || 0) + 1;
                if (BigCommand.dungeonSession != null) {
                    BigCommand.dungeonSession.loot[text] = (BigCommand.dungeonSession.loot[text] || 0) + 1;
                }
            }
        }


        if (text.match(/Party Finder > (.+) joined the dungeon group! .+/)) {
            const match = text.match(/Party Finder > (.+) joined the dungeon group! .+/);
            getPlayerByName(match[1], BigPlayer.TaskType.CHECK);
            return;
        }

        if (text == "[NPC] Mort: Here, I found this map when I first entered the dungeon.") {
            ChatHandler.dungeon = new DungeonRun();
            if (data.autoStartSession && BigCommand.dungeonSession == null) {
                BigCommand.dungeonSession = new DungeonSession();
            }
            return;
        }
 
        if (ChatHandler.dungeon == null) {
            return;
        }

        if (text.startsWith("[BOSS] The Watcher:")) {
            if (!ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.CAMP]) {
                ChatHandler.dungeon.doSplit(DungeonRun.SplitType.CAMP, DungeonRun.SplitType.START);
                return;
            }

            if (text == "[BOSS] The Watcher: You have proven yourself. You may pass.") {
                ChatHandler.dungeon.doSplit(DungeonRun.SplitType.CAMP, DungeonRun.SplitType.END);
                return;
            }
        }

        if (text == "[BOSS] Goldor: Who dares trespass into my domain?") {
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.TERMS, DungeonRun.SplitType.START);
            return;
        }

        if (text.match(/([a-zA-Z0-9_]{3,16}) completed a device!.+/)) {
            let match = text.match(/([a-zA-Z0-9_]{3,16}) completed a device!.+/);
            let name = match?.[1]?.toLowerCase();

            if (!name) {
                return;
            }

            if (!ChatHandler.dungeon.ssDone && ChatHandler.dungeon.partyMembers[name] == "Healer") {
                let compMS = Date.now() - ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.TERMS][0];
                let compTicks = tick.getTotalTicks() - ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.TERMS][1];
                
                getPlayerByName(name, BigPlayer.TaskType.UPDATE, [BigPlayer.TaskType.SS, compMS, compTicks]);
                ChatHandler.dungeon.ssDone = true;
                return;
            }

            if (!ChatHandler.dungeon.pre4Done && ChatHandler.dungeon.partyMembers[name] == "Berserk") {
                ChatHandler.dungeon.pre4Done = true;
                getPlayerByName(name, BigPlayer.TaskType.PRE4, true);
                return;
            }

            if (!ChatHandler.dungeon.pre4Done && ChatHandler.dungeon.splits[DungeonRun.SplitType.START]?.[DungeonRun.SplitType.TERMS] && this.partyMembers?.[name] == "Berserk" && Date.now() - ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.TERMS][0] < 17000) {
                ChatHandler.dungeon.pre4Done = true; 
                getPlayerByName(name, BigPlayer.TaskType.PRE4, false);
            }

            if (!ChatHandler.dungeon.pre4Done && ChatHandler.dungeon.splits[DungeonRun.SplitType.START]?.[DungeonRun.SplitType.TERMS] && Date.now() - ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.TERMS][0] > 17000) {
                ChatHandler.dungeon.pre4Done = true;
                for (let name of Object.keys(ChatHandler.dungeon.partyMembers)) {
                    if (ChatHandler.dungeon.partyMembers[name] == "Berserk") {
                        getPlayerByName(name, BigPlayer.TaskType.PRE4, false);
                        return;
                    }
                }
            }
        }

        if (text == "The Core entrance is opening!") {
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.TERMS, DungeonRun.SplitType.END);
            return;
        }

        if (text.match(/\s+☠ Defeated (.+) in (\d+)m\s+(\d+)s/)) {
            if (ChatHandler.dungeon.runDone) {
                return;
            }

            let match = text.match(/\s+☠ Defeated (.+) in (\d+)m\s+(\d+)s/);
            let time = (parseInt(match[2]) * 60) + parseInt(match[3]);
            let nPartyMembers = ChatHandler.dungeon.numPartyMembers;
            let t = ChatHandler.dungeon.floor?.[0];
            let f = ChatHandler.dungeon.floor?.[1];
            let score = Utils.findScoreboardScore();

            if (!t || !f) {
                console.log(`error on scoreboard floor: ${t} ${f}`);
                return;
            }

            if (!runData?.[t]) {
                runData[t] = {};
            }

            if (!runData[t]?.[f]) {
                runData[t][f] = {};
            }

            if (!runData[t][f]?.[nPartyMembers]) {
                runData[t][f][nPartyMembers] = {
                    fastest: time,
                    avg: time,
                    slowest: time,
                    num: 1,
                    avgScore: score,
                    avgScoreN: 1
                }
            } else {
                let temp = runData[t][f][nPartyMembers];
                if (time < temp.fastest) {
                    temp.fastest = time;
                }
                if (time > temp.slowest) {
                    temp.slowest = time;
                }
                if (!temp?.avgScore) {
                    temp.avgScore = 0;
                    temp.avgScoreN = 0;
                }
                temp.avg = Utils.calcMovingAvg(temp.avg, temp.num, time);
                temp.avgScore = Utils.calcMovingAvg(temp.avgScore, temp.avgScoreN, score);
                temp.avgScoreN += 1;
                temp.num += 1;
                runData[t][f][nPartyMembers] = temp;
            }

            runData.save();
            console.log(`ChatHandler.dungeon.floor ${ChatHandler.dungeon.floor}`);
            if (ChatHandler.dungeon.floor == "M7") {
                ChatHandler.dungeon.endRun(time);
                if (BigCommand.dungeonSession != null) {
                    BigCommand.dungeonSession.endRun(time, score);
                }
            }

            ChatHandler.dungeon.runDone = true;
            return;
        }

        if (text.match(/☠(.+)/) && !(text.includes(" Defeated ") || text.includes("reconnected.") || text.includes(" disconnected "))) {
            let name = text.split(" ")[2].toLowerCase();
            if (text.includes(" You ")) name = Player.getName().toLowerCase();
            if (name.trim() == "") return;
        
            if (!ChatHandler.dungeon.pre4Done && ChatHandler.dungeon.splits[DungeonRun.SplitType.START]?.[DungeonRun.SplitType.TERMS] && this.partyMembers?.[name] == "Berserk") {
                ChatHandler.dungeon.pre4Done = true; 
                getPlayerByName(name, BigPlayer.TaskType.PRE4, false);
            }
            
            getPlayerByName(name, BigPlayer.TaskType.DEATH);
        }
    }
}


class BigPlayer {
    static TaskType = Object.freeze({
        CHECK: "CHECK",
        UPDATE: "UPDATE",
        SS: "SS",
        PRE4: "PRE4",
        TERMS: "TERMS",
        RUNDONE: "RUNDONE",
        DEATH: "DEATH",
        BR: "BR",
        PRINT: "PRINT",
        NOTE: "NOTE",
        DODGE: "DODGE",
        VIEWFILE: "VIEWFILE"
    });

    constructor(UUID, username="", extra=null) {
        if (extra == null) {
            this.playerData = new PogObject("bigtracker/bigplayers", {
                UUID: UUID,
                USERNAME: username?.toLowerCase()
            }, `${UUID}.json`);

            if (username != "" && username != this.playerData["USERNAME"]) {
                ChatLib.chat(`${username} changed it's name from ${this.playerData["USERNAME"]}`);
                this.playerData["USERNAME"] = username;
            }
        } else {
            this.playerData = new PogObject("bigtracker/bigplayers", extra, `${UUID}.json`);
        }

        this.save();
    };

    save() {
        this.playerData.save();
    }

    doTask(task=null, extra=null) {
        if (task == null && extra == null) {
            return;
        }

        switch (task) {
            case BigPlayer.TaskType.CHECK:
                this.printPlayer();
                this.check();
                break;
            case BigPlayer.TaskType.UPDATE:
                this.updateTime(extra[0], extra[1], extra[2]);
                break;
            case BigPlayer.TaskType.PRE4:
                this.pre4(extra);
                break;
            case BigPlayer.TaskType.DEATH:
                this.playerData["DEATHS"] = (this.playerData["DEATHS"] || 0) + 1;
                this.save();
                break;
            case BigPlayer.TaskType.PRINT:
                this.printPlayer();
                break;
            case BigPlayer.TaskType.RUNDONE:
                let runTimeMS = ChatHandler.dungeon.splits[DungeonRun.SplitType.END][DungeonRun.SplitType.RUN][0] - ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.RUN][0];
                let runTimeTicks = ChatHandler.dungeon.splits[DungeonRun.SplitType.END][DungeonRun.SplitType.RUN][1] - ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.RUN][1];
                this.updateTime(BigPlayer.TaskType.RUNDONE, runTimeMS, runTimeTicks);
                this.playerData["RUNS"] = (this.playerData["RUNS"] || 0) + 1;
                this.playerData["CLASS"] = ChatHandler?.dungeon?.partyMembers?.[this.playerData?.["USERNAME"]];
                this.playerData["LASTRUN"] = Date.now();
                this.save();
                break;
            case BigPlayer.TaskType.NOTE:
                this.note(extra);
                break;
            case BigPlayer.TaskType.BR:
                this.updateTime(extra[0], extra[1], extra[2]);
                break;
            case BigPlayer.TaskType.DODGE:
                let len = extra[0];
                let note = extra[1];
                if (this.playerData?.["DODGE"]) {
                    this.playerData["DODGE"] = false;
                    this.playerData["DODGELENGTH"] = undefined;
                    this.playerData["DODGEDATE"] = undefined;
                    ChatLib.chat(`&9Dodge Removed &7>> &f${this.playerData["USERNAME"]}`);
                    this.save();
                    return;
                }

                this.playerData["DODGE"] = true;
                let dodgeStr = `&8Now Dodging &7>> &f${this.playerData.USERNAME}`

                if (len != 0) {
                    this.playerData["DODGEDATE"] = Date.now();
                    this.playerData["DODGELENGTH"] = len;
                    dodgeStr += `\n&8Days &7>> &f${len}`;
                }

                if (note != "") {
                    this.playerData["NOTE"] = note;
                    dodgeStr += `\n&8Note &7>> &f${note}`;
                }

                this.save();
                ChatLib.chat(dodgeStr);
                break;
            case BigPlayer.TaskType.VIEWFILE:
                for(let key of Object.keys(this.playerData)) {
                    this.viewFileHelper(key, this.playerData[key]);
                }
                break;
            default:
                break;
        }
    }

    viewFileHelper(key, value) {
        if (Array.isArray(value)) {
            ChatLib.chat(`${key}: ${value.join(", ")}`);
        } else if (typeof value === "object" && value !== null) {
            for (const subKey in value) {
                viewFileHelper(`${key}.${subKey}`, value[subKey]);
            }
        } else {
            ChatLib.chat(`${key}: ${value}`);
        }
    }

    check() {
        if (!data.autoKick) return;

        if (this.playerData?.["DODGE"]) {
            let timeLeft = 0;
            if (this.playerData?.["DODGELENGTH"]) {
                timeLeft = this.playerData["DODGELENGTH"] - ((Date.now() - this.playerData["DODGEDATE"]) / 86400000);
                if (timeLeft < 0) {
                    this.playerData["DODGE"] = false;
                    this.playerData["DODGELENGTH"] = 0;
                    this.playerData["DODGEDATE"] = 0;
                    ChatLib.chat("&7>> Dodge Expired");
                    this.save();
                    return;
                }
            }

            if (data.sayReason && "NOTE" in this.playerData && this.playerData["NOTE"] != "") {
                if (timeLeft == 0) {
                    ChatLib.command(`pc ${this.playerData["NOTE"]}`)
                } else {
                    ChatLib.command(`pc ${this.playerData["NOTE"]}. try again in ${timeLeft.toFixed(1)} days.`);
                }
            }

            setTimeout( () => {
                ChatLib.command(`p kick ${this.playerData["USERNAME"]}`);
            }, 500);
        }
    }

    note(noteStr="") {
        if (noteStr == "") {
            this.playerData["NOTE"] = "";
            ChatLib.chat(`&7>> &fCleared note for ${this.playerData["USERNAME"]}`);
        } else {
            this.playerData["NOTE"] = noteStr;
            ChatLib.chat(`&b${this.playerData["USERNAME"]}`);
            ChatLib.chat(`&9Note &7>> &f${this.playerData["NOTE"]}`);
        }
    }

    printPlayer() {
        Utils.chatMsgClickURL(`&7>> &b${this.playerData["USERNAME"]}`, `${BigCommand.nameHistorySite[data.nameHistory]}${this.playerData["UUID"]}`);
        if (this.playerData?.["CLASS"] != undefined) {
            ChatLib.chat(`&9Class &7>> &f${this.playerData["CLASS"]}`);
        }

        if (this.playerData?.["NOTE"] != undefined && this.playerData["NOTE"] != "") {
            ChatLib.chat(`&9Note &7>> &f${this.playerData["NOTE"]}`);
        }

        if (this.playerData?.["DODGE"]) {
            if (this.playerData?.["DODGELENGTH"]) {
                let timeLeft = this.playerData["DODGELENGTH"] - ((Date.now() - this.playerData["DODGEDATE"]) / 86400000);
                ChatLib.chat(`&c>> &4Dodged&c; &f${timeLeft.toFixed(1)} days remaining`);
            }
            else {
                ChatLib.chat(`&c>> &4Dodged`);
            }
        }

        if (this.playerData?.["RUNS"]) {
            ChatLib.chat(`&9Runs &7>> &f${this.playerData["RUNS"]}`);

            if (this.playerData?.["DEATHS"]) {
                ChatLib.chat(`&9DPR &7>> &f${(this.playerData["DEATHS"] / this.playerData["RUNS"]).toFixed(2)}`);
            }

            if (this.playerData?.["LASTRUN"]) {
                ChatLib.chat(`&9Last Run &7>> &f${((Date.now() - this.playerData["LASTRUN"]) / 86400000).toFixed(2)}d ago`);
            }

            let pbString = "&9PBs &7>> ";

            if (this.playerData?.["SSpb"]) {
                pbString += "&fSS: [";
                let pbSS = this.playerData["SSpb"];
                if (pbSS[0] / 1000 < 12) pbString += `&a`;
                else if (pbSS[0] / 1000 < 13) pbString += `&e`;
                else pbString += `&c`;
                pbSS = Utils.formatMSandTick(pbSS);
                pbString += `${pbSS[0]}, ${pbSS[1]}&f] &7| &r`;
            }

            if (this.playerData?.["TERMSpb"]) {
                pbString += "&fTerms: [";
                let pbTerms = this.playerData["TERMSpb"];
                if (pbTerms[0] / 1000 < 40) pbString += `&a`;
                else if (pbTerms[0] / 1000 < 45) pbString += `&e`;
                else pbString += `&c`;
                pbTerms = Utils.formatMSandTick(pbTerms);
                pbString += `${pbTerms}&f] &7| &r`;
            }

            if (this.playerData?.["RUNDONEpb"]) {
                pbString += "&fRun: [";
                let pbRun = this.playerData["RUNDONEpb"];
                if (pbRun[0] / 1000 < 310) pbString += `&a`;
                else if (pbRun[0] / 1000 < 330) pbString += `&e`;
                else pbString += `&c`;
                pbRun = Utils.formatMSandTick(pbRun);
                pbString += `${pbRun[0]}, ${pbRun[1]}&f] &7| &r`;
            }

            if (this.playerData?.["CAMPpb"]) {
                pbString += "&fCamp: [";
                let pbCamp = this.playerData["CAMPpb"];
                if (pbCamp[0] / 1000 < 61) pbString += `&a`;
                else if (pbCamp[0] / 1000 < 65) pbString += `&e`;
                else pbString += `&c`;
                pbCamp = Utils.formatMSandTick(pbCamp);
                pbString += `${pbCamp[0]}, ${pbCamp[1]}&f] &7| &r`;
            }

            if (pbString != "&9PBs &7>> ") {
                ChatLib.chat(pbString);
            }


            let medString = "&9AVGs &7>> ";

            if ("SS" in this.playerData) {
                let avgSS = this.getAvgOfType(BigPlayer.TaskType.SS);

                if (avgSS != null && !isNaN(avgSS[0])) {
                    medString += "&fSS: [";
                    if (avgSS[0] / 1000 < 13) medString += `&a`;
                    else if (avgSS[0] / 1000 < 14) medString += `&e`;
                    else medString += `&c`;
                    avgSS = Utils.formatMSandTick(avgSS);
                    medString += `${avgSS[0]}, ${avgSS[1]}&f] &7| &r`;
                }
            }

            if ("BR" in this.playerData) {
                let avgBR = this.getAvgOfType(BigPlayer.TaskType.BR); 

                if (avgBR != null && !isNaN(avgBR[0])) {
                    medString += "&fBR: [";
                    if (avgBR[0] / 1000 < 25) medString += `&a`;
                    else if (avgBR[0] / 1000 < 32) medString += `&e`;
                    else medString += `&c`;
                    avgBR = Utils.formatMSandTick(avgBR);
                    medString += `${avgBR[0]}, ${avgBR[1]}&f] &7| &r`;
                }
            }

            if ("CAMP" in this.playerData) {
                let avgCamp = this.getAvgOfType(DungeonRun.SplitType.CAMP);

                if (avgCamp != null && !isNaN(avgCamp[0])) {
                    medString += "&fCamp: [";
                    if (avgCamp[0] / 1000 < 66) medString += `&a`;
                    else if (avgCamp[0] / 1000 < 70) medString += `&e`;
                    else medString += `&c`;
                    avgCamp = Utils.formatMSandTick(avgCamp);
                    medString += `${avgCamp[0]}, ${avgCamp[1]}&f] &7| &r`;
                }
            }

            if ("TERMS" in this.playerData) {
                let avgTerms = this.getAvgOfType(BigPlayer.TaskType.TERMS);

                if (avgTerms != null && !isNaN(avgTerms[0])) {
                    medString += "&fTerms: [";
                    if (avgTerms[0] / 1000 < 45) medString += `&a`;
                    else if (avgTerms[0] / 1000 < 51) medString += `&e`;
                    else medString += `&c`;
                    avgTerms = Utils.formatMSandTick(avgTerms);
                    medString += `${avgTerms[0]}, ${avgTerms[1]}&f] &7| &r`;
                }
            }

            if ("RUNDONE" in this.playerData) {
                let avgRun = this.getAvgOfType(BigPlayer.TaskType.RUNDONE);

                if (avgRun != null && !isNaN(avgRun[0])) {
                    medString += "&fRun: [";
                    if (avgRun[0] / 1000 < 330) medString += `&a`;
                    else if (avgRun[0] / 1000 < 360) medString += `&e`;
                    else medString += `&c`;
                    avgRun = Utils.formatMSandTick(avgRun);
                    medString += `${avgRun[0]}, ${avgRun[1]}&f] &7| &r`;
                }
            }

            if (medString != "&9AVGs &7>> ") {
                ChatLib.chat(medString);
            }

            if ("pre4raten" in this.playerData && this.playerData["pre4raten"] != 0) {
                ChatLib.chat(`&9Pre4 &7>> &f${this.playerData?.["pre4rate"] || 0}/${this.playerData?.["pre4raten"]} (${((this.playerData?.["pre4rate"] || 0) / (this.playerData?.["pre4raten"] || 1) * 100).toFixed(2)}%)`);
            }
        } else {
            ChatLib.chat("&8Runs &7>> &f0");
        }
    }
    
    updateTime(updateType, compMS, compTicks) {
        // update type MS, update type Ticks? have ms and tick pb? no moving avg anymore. track by array instead, last 30 runs.

        if (!this.playerData?.[updateType]) {
            this.playerData[updateType] = [[compMS, compTicks]];
            this.playerData[updateType + "pb"] = [compMS, compTicks];
            this.save();
            return;
        }

        this.playerData[updateType].push([compMS, compTicks]);
        if (this.playerData[updateType].length > 30) {
            this.playerData[updateType].shift();
        }

        if ([BigPlayer.TaskType.SS, BigPlayer.TaskType.TERMS, BigPlayer.TaskType.RUNDONE].includes(updateType)) {
            let avg = this.getAvgOfType(updateType);
            ChatLib.chat(`&7> ${this.playerData.USERNAME} > &f${updateType} completed in ${(compMS / 1000).toFixed(2)} (${compTicks / 20}t) pb: [${(this.playerData[updateType + "pb"][0] / 1000).toFixed(2)}, ${this.playerData[updateType + "pb"][1] / 20}] avg: [${(avg[0] / 1000).toFixed(2)}, ${avg[1] / 20}]`);
        }

        if (!this.playerData[updateType + "pb"]) {
            this.playerData[updateType + "pb"] = [compMS, compTicks];
        } else if (this.playerData[updateType + "pb"][0] > compMS) {
            this.playerData[updateType + "pb"] = [compMS, compTicks];
        }
    }

    getAvgOfType(updateType) {
        if (!this.playerData?.[updateType] || this.playerData[updateType].length < 1) {
            return null;
        }

        let tempMSArr = this.playerData[updateType].map( (x) => x[0]).sort((a, b) => a - b);
        let tempTickArr = this.playerData[updateType].map( (x) => x[1]).sort((a, b) => a - b);
        
        let half = Math.floor(tempMSArr.length / 2);

        let tempMs = (tempMSArr.length % 2 ? tempMSArr[half] : (tempMSArr[half - 1] + tempMSArr[half]) / 2);
        let tempTick = (tempTickArr.length % 2 ? tempTickArr[half] : (tempTickArr[half - 1] + tempTickArr[half]) / 2);

        return [tempMs, tempTick];
    }

    pre4(extra) {
        this.playerData.pre4raten = (this.playerData.pre4raten || 0) + 1;
        this.playerData.pre4rate = (this.playerData.pre4rate || 0) + (extra ? 1 : 0);

        this.save();
    }
}


class OnTick {
    constructor() {
        this.totalTicks = 0;
    }

    do() {
        this.totalTicks++;

        if (ChatHandler.dungeon != null && this.totalTicks % 60 == 0) {
            ChatHandler.dungeon.getPartyMembers();
        }
    }

    getTotalTicks() {
        return this.totalTicks;
    }

    reset() {
        this.totalTicks = 0;
    }
}


class DungeonRun {
    static SplitType = Object.freeze({
        START: "START",
        END: "END",
        RUN: "RUN",
        CAMP: "CAMP",
        TERMS: "TERMS"
    });

    constructor() {
        this.partyMembers = {};
        this.gotAllMembers = false;
        this.splits = {
            "START": {},
            "END": {}
        };
        this.ssDone = false;
        this.pre4Done = false;
        this.soloRun = false;
        this.numPartyMembers = null;
        this.runDone = false;
        this.doSplit(DungeonRun.SplitType.RUN, DungeonRun.SplitType.START);
        this.floor = Utils.findScoreboardFloor();
    }

    doSplit(type, or) {
        this.splits[or][type] = [Date.now(), tick.getTotalTicks()];

        switch (or) {
            case DungeonRun.SplitType.START:
                switch (type) {
                    case DungeonRun.SplitType.CAMP:
                        for (let name of Object.keys(this.partyMembers)) {
                            if (this.partyMembers[name] != "Mage" && this.partyMembers[name] != "Archer") {
                                continue;
                            }
                            getPlayerByName(name, BigPlayer.TaskType.UPDATE, [BigPlayer.TaskType.BR, this.splits[or][type][0], this.splits[or][type][1]]);
                        }
                        break;
                }
                break;
            case DungeonRun.SplitType.END:
                switch (type) {
                    case DungeonRun.SplitType.CAMP:
                        for (let name of Object.keys(this.partyMembers)) {
                            if (this.partyMembers[name] != "Mage") continue;
                            let campDoneAt = this.splits[or][type];
                            let campStartedAt = this.splits[DungeonRun.SplitType.START][type];
                            let campTime = [campDoneAt[0] - campStartedAt[0], campDoneAt[1] - campStartedAt[1]];
                            getPlayerByName(name, BigPlayer.TaskType.UPDATE, [DungeonRun.SplitType.CAMP, campTime[0], campTime[1]]);
                            break;
                        }
                        break;
                    case DungeonRun.SplitType.TERMS:
                        let termsStartedAt = this.splits[DungeonRun.SplitType.START][type];
                        let termsEndedAt = this.splits[DungeonRun.SplitType.END][type];
                        let termTime = [termsEndedAt[0] - termsStartedAt[0], termsEndedAt[1] - termsStartedAt[1]];
                        for (let name of Object.keys(this.partyMembers)) {
                            getPlayerByName(name, BigPlayer.TaskType.UPDATE, [DungeonRun.SplitType.TERMS, termTime[0], termTime[1]]);
                        }
                        break;
                }
                break;
        }
    }

    endRun(time) {
        this.doSplit(DungeonRun.SplitType.RUN, DungeonRun.SplitType.END);
        for (let name of Object.keys(this.partyMembers)) {
            getPlayerByName(name, BigPlayer.TaskType.RUNDONE, time);
        }
    }

    getPartyMembers = () => {
        if (this.gotAllMembers && !this.soloRun) return;
    
        const Scoreboard = TabList?.getNames();
        if (!Scoreboard || Scoreboard?.length === 0) return;
    
        this.numPartyMembers = parseInt(Scoreboard[0]?.charAt(28));
        let deadPlayer = false;
        let tempPartyMembers = {};
    
        soloRun = this.numPartyMembers == 1;
    
        for (let i = 1; i < Scoreboard.length; i++) {
            if (Object.keys(tempPartyMembers).length === this.numPartyMembers || Scoreboard[i].includes("Player Stats")) {
                break;
            }
    
            if (Scoreboard[i].includes("[")) {
                let line = Scoreboard[i].removeFormatting();
                // [LVL] ?youtube? name ? (Class/Dead ?LVL)
                // /\[\d+\].* ([a-zA-Z0-9_]{3,16}) .*\((Archer|Mage|Tank|Berserk|Healer|DEAD|EMPTY).*\)/
                let match = line.match(/\[\d+\].* ([a-zA-Z0-9_]{3,16}) .*\((Archer|Mage|Tank|Berserk|Healer|DEAD|EMPTY).*\)/);
                let name = match?.[1]?.toLowerCase();
                let playerClass = match?.[2]?.trim();
    
                if (!name || !playerClass) {
                    deadPlayer = true;
                    continue;
                }
    
                if (playerClass == "DEAD" || playerClass == "EMPTY") {
                    deadPlayer = true;
                }
    
                tempPartyMembers[name] = playerClass;
            }
    
            this.gotAllMembers = !deadPlayer;
            this.partyMembers = tempPartyMembers;
        }
    }
}


class Utils {
    static formatMSandTick(times) {
        let seconds = times[0] / 1000;
        let ticks = times[1] / 20;

        let timeStr = "";
        let tickStr = "";
        if (seconds > 60) {
            timeStr += `${Math.trunc(seconds / 60)}m `
        }
        timeStr += `${(seconds % 60).toFixed(2)}s`;
        if (ticks > 60) {
            tickStr += `${Math.trunc(ticks / 60)}m `
        }
        tickStr += `${(ticks % 60).toFixed(2)}s`;

        return [timeStr, tickStr];
    }

    static chatMsgClickCMD(msgTxt, cmd) {
        new TextComponent(msgTxt).setClick("run_command", cmd).chat();
    }

    static chatMsgClickURL(msgTxt, clickTxt) {
        new TextComponent(msgTxt).setClick("open_url", clickTxt).chat();
    }

    static chatMsgHover(msgTxt, hoverTxt) {
        new TextComponent(msgTxt).setHover("show_text", hoverTxt).chat();
    }


    static calcMovingAvg(t, n, time) {
        return t * n / (n + 1) + (time / (n + 1));
    }

    static toRoman = ["I", "II", "III", "IV", "V", "VI", "VII"];

    static fakeLastGuiName() {
        let t = ChatHandler.dungeon.floor[0];
        let f = ChatHandler.dungeon.floor[1];

        let guiNameStr = "";
        if (t == "E") {
            return "Entrance";
        } else if (t == "F") {
            guiNameStr = "The Catacombs ";
        } else if (t == "M") {
            guiNameStr = "Master Mode The Catacombs ";
        }

        guiNameStr += "Floor ";
        return guiNameStr + Utils.toRoman[f - 1];
    }

    // static msgToFloor = {
    //     "Maxor, Storm, Goldor, and Necron": 7,
    //     "Sadan": 6,
    //     "Livid": 5,
    //     "Thorn": 4,
    //     "The Professor": 3,
    //     "Scarf": 2,
    //     "Bonzo": 1,
    //     "The Watcher": 0
    // }

    static findScoreboardFloor() {
        let board = Scoreboard.getLines();
        
        for (let i = 0; i < board.length; i++) {
            let line = board[i].getName().removeFormatting();
            let match = line.match(/.+ \((M|F)(\d)\)/);
            if (!match?.[1]) {
                if (line.includes("(E)")) {
                    return ["F", 0];
                }
                continue;
            }
            return [match[1], parseInt(match[2])];
        }
    }

    static findScoreboardScore() {
        let board = Scoreboard.getLines();
        
        for (let i = 0; i < board.length; i++) {
            let line = board[i].getName().removeFormatting();
            let match = line.match(/Cleared: \d+% \((\d+)\)/);
            if (!match?.[1]) {
                continue;
            }
            return parseInt(match[1]);
        }
    }

    static secondsToFormatted(seconds) {
        return `${Math.trunc(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    }
}


const tick = new OnTick();


register("packetReceived", (packet, event) => {
    if (packet.func_148916_d()) {
        return;
    }

    const chatComponent = packet.func_148915_c();
    const text = new String(chatComponent.func_150254_d().removeFormatting());

    ChatHandler.runText(text);
}).setFilteredClass(S02PacketChat);


register("packetReceived", (packet, event) => {
    tick.do();
}).setFilteredClass(S32PacketConfirmTransaction);


register("packetSent", (packet, event) => {
    let item = packet?.func_149546_g();
    if (!item) return;
    item = new Item(item);
    if (item.getName()?.includes("The Catacombs")) {
        let cataType = item.getName()?.removeFormatting();
        let cataFloor = item.getLore()[1]?.removeFormatting()?.match(/Tier: (.+)/)?.[1];
        if (!cataType || !cataFloor) {
            return;
        }
        ChatHandler.lastGuiName = `${cataType} ${cataFloor}`;
    }
}).setFilteredClass(C0EPacketClickWindow);


class BigCommand {
    static tabCommands = ["dodge", "note", "list", "floorstats", "loot", "session", "autokick", "sayreason", "viewfile", "autostart"];
    static cmdName = "big";
    static chestTypes = ["WOOD CHEST REWARDS", "GOLD CHEST REWARDS", "DIAMOND CHEST REWARDS", "EMERALD CHEST REWARDS", "OBSIDIAN CHEST REWARDS", "BEDROCK CHEST REWARDS"];
    static essenceTypes = ["Undead Essence", "Wither Essence"];
    static dungeonSession = null;
    static nameHistorySite = ["https://namemc.com/search?q=", "https://laby.net/@"];

    static help = () => {
        ChatLib.chat(`&7-------------&3bigtracker&7-------------`);
        Utils.chatMsgClickCMD(`&7>> &fautokick&7: &${data.autoKick ? "aenabled" : "cdisabled"}`, `/${BigCommand.cmdName} autokick`);
        Utils.chatMsgClickCMD(`&7>> &fsayreason&7: &${data.sayReason ? "aenabled" : "cdisabled"}`, `/${BigCommand.cmdName} sayreason`);
        Utils.chatMsgClickCMD(`&7>> &fauto start session&7: &${data.autoStartSession ? "aenabled" : "cdisabled"}`, `/${BigCommand.cmdName} autostart`);
        Utils.chatMsgClickCMD(`&7>> &fname history site&7: &${data.nameHistory ? "enamemc" : "blaby"}`, `/${BigCommand.cmdName} namehistory`);
        ChatLib.chat("&7>> &fdodge &bname days? note?");
        ChatLib.chat("&7>> &fnote &bname note");
        Utils.chatMsgClickCMD("&7>> &flist&7: lists all dodged players and players with a note", `/${BigCommand.cmdName} list`);
        ChatLib.chat("&7>> &ffloorstats &bfloor &7(ex: floorstats m7)");
        ChatLib.chat("&7>> &floot &bfloor &7(ex: loot m7)");
        Utils.chatMsgClickCMD("&7>> &fsession &7(click for more info)", `/${BigCommand.cmdName} session`);
        ChatLib.chat("&7>> &fviewfile &busername &7(prints the players entire file in your chat, no reason to ever use this probably)");
    }

    static session(args) {
        if (!args?.[1]) {
            ChatLib.chat(`/${BigCommand.cmdName} session`);
            ChatLib.chat(DungeonSession.CommandList.join(", "));
            Utils.chatMsgClickCMD(`Current Session: ${BigCommand.dungeonSession != null ? "active" : "inactive"}`, `/${BigCommand.cmdName} session view`);
            return;
        }

        switch(args[1].toLowerCase()) {
            case "start":
                if (BigCommand.dungeonSession != null) {
                    BigCommand.dungeonSession.saveSession();
                }
                BigCommand.dungeonSession = new DungeonSession();
                break;
            case "end":
                if (BigCommand.dungeonSession == null) {
                    ChatLib.chat(`You don't have an active dungeon session to end`);
                    return;
                }
                BigCommand.dungeonSession.saveSession();
                BigCommand.dungeonSession = null;
                break;
            case "view":
                if (BigCommand.dungeonSession == null || args?.[2] == "old") {
                    BigCommand.oldSessionSearcher(args?.[3] || 0);
                    return;
                }

                BigCommand.dungeonSession.view();
                break;
            case "viewfile":
                if (!args?.[2]) {
                    ChatLib.chat("no filename included");
                    return;
                }
                DungeonSession.viewFile(args[2]);
                break;
        }
    }

    static oldSessionSearcher(page) {
        if (page == null) {
            page = 0;
        }
        page = parseInt(page);

        if (!FileLib.exists("./config/ChatTriggers/modules/bigtracker/bigsessions")) {
            ChatLib.chat("No sessions exist");
            new File("./config/ChatTriggers/modules/bigtracker/bigsessions").mkdirs();
            return;
        }

        const pageLength = 6;

        let sessionList = new File("./config/ChatTriggers/modules/bigtracker/bigsessions").list();
        let totalPages = Math.ceil(sessionList.length / pageLength);

        ChatLib.chat(`&7-------------&3Page ${page+1}&7-------------`);
        for (let i = page*pageLength; i < pageLength+(page*pageLength); i++) {
            try {
                Utils.chatMsgClickCMD(`${new Date(parseInt(sessionList[i].replace(".json", ""))).toString()}`, `/${BigCommand.cmdName} session viewfile ${sessionList[i]}`);
            } catch (e) {} // i cba to write proper logic for this and i think this will work so whatever
        }
        ChatLib.chat(`&7Page: ${page+1}/${totalPages}`);
        if (page+1 < totalPages) {
            Utils.chatMsgClickCMD("&7>>> &cNext Page &7>>>", `/${BigCommand.cmdName} session view old ${page+1}`);
        }
    }

    static viewFile(args) {
        if (!args?.[1]) {
            ChatLib.chat(`/${BigCommand.cmdName} viewfile name`);
            return;
        }

        getPlayerByName(args[1], BigPlayer.TaskType.VIEWFILE);
    }

    static printAllPlayers() {
        new Thread( () => {
            let files = new File("./config/ChatTriggers/modules/bigtracker/bigplayers").list();

            for (let i = 0; i < files.length; i++) {
                let tempPlayer = new BigPlayer(files[i].replace(".json", ""));
                if (!tempPlayer || (!tempPlayer.playerData?.["DODGE"] && !tempPlayer.playerData?.["NOTE"])) {
                    continue;
                }

                let playerStr = `&7>> &b${tempPlayer.playerData["USERNAME"]}&f:&7 `;
                if (tempPlayer.playerData?.["NOTE"] && tempPlayer.playerData["NOTE"] != "") {
                    playerStr += tempPlayer.playerData["NOTE"];
                }
                
                if (tempPlayer.playerData?.["DODGE"]) {
                    if ("DODGELENGTH" in tempPlayer.playerData && tempPlayer.playerData["DODGELENGTH"] != 0) {
                        let timeLeft = tempPlayer.playerData["DODGELENGTH"] - ((Date.now() - tempPlayer.playerData["DODGEDATE"]) / 86400000);
                        playerStr += ` (dodged; ${timeLeft.toFixed(1)} days remaining)`;
                    } else {
                        playerStr += " (dodged)";
                    }
                }
                Utils.chatMsgClickCMD(playerStr, `/${BigCommand.cmdName} ${tempPlayer.playerData["USERNAME"]}`);
            }
        }).start();
    }

    static loot = (floor) => {
        if (floor == undefined) {
            ChatLib.chat("No floor entered, defaulting to M7");
            floor = "M7";
        }
        floor = floor.toUpperCase();
        let floorStr = "";
        if (floor.charAt(0) == "M") {
            floorStr += "Master Mode ";
        }
        floorStr += "The Catacombs Floor ";
        floorStr += Utils.toRoman[parseInt(floor.charAt(1)) - 1];
        let floorLoot = runData["chests"]?.[floorStr];
        ChatLib.chat(`&fLoot for &c${floorStr}`);
        if (!floorLoot) {
            ChatLib.chat("&cInvalid Floor");
            return;
        }

        ChatLib.chat(`&fTotal Chests: ${floorLoot["Total"]}`);
        for (let type of BigCommand.chestTypes) {
            if (!floorLoot?.[type]) continue;
            ChatLib.chat(`&8${type}&7: ${floorLoot[type]}`);
        }

        for (let type of Object.keys(floorLoot)) {
            if (!type.includes("Enchanted Book")) continue;
            ChatLib.chat(`&c${type}&7: ${floorLoot[type]}`);
        }

        for (let type of BigCommand.essenceTypes) {
            if (!floorLoot?.[type]) continue;
            ChatLib.chat(`&e${type}&7: ${floorLoot[type]}`);
        }
        
        for (let type of Object.keys(floorLoot)) {
            if (BigCommand.essenceTypes.includes(type) || BigCommand.chestTypes.includes(type) || type == "Total" || type.includes("Enchanted Book")) continue;
            ChatLib.chat(`&d${type}&7: ${floorLoot[type]}`);
        }
    }

    static dodge = (args) => {
        if (!args?.[1]) {
            ChatLib.chat(`/${BigCommand.cmdName} dodge <name> <?days?> <?note?>`);
            return;
        }

        let name = args[1].toLowerCase();
        let length = parseInt(args?.[2]);
        let note = args.splice(isNaN(length) ? 2 : 3)?.join(" ");
        length = isNaN(length) ? 0 : length;

        getPlayerByName(name, BigPlayer.TaskType.DODGE, [length, note]);
    }

    static note = (args) => {
        if (!args?.[1]) {
            ChatLib.chat(`/${BigCommand.cmdName} note <name> <?note?>`);
            return;
        }
        getPlayerByName(args[1], BigPlayer.TaskType.NOTE, args.slice(2).join(" "));
    }

    static view = (args) => {
        if (!args?.[0]) {
            ChatLib.chat(`/${BigCommand.cmdName} <name>`);
            return;
        }

        if (args[0] == "get") {
            args.shift();
        }

        getPlayerByName(args[0], BigPlayer.TaskType.PRINT);
    }

    static floorStats = (args) => {
        if (!args?.[1]) {
            ChatLib.chat(`ex: /${BigCommand.cmdName} floorstats m7`);
            return;
        }

        let T = args[1].charAt(0).toUpperCase();
        let F = parseInt(args[1].charAt(1));
        let numPlayers = 5;
        if (args?.[2]) {
            numPlayers = parseInt(args[2]);
        }

        if (isNaN(F) || isNaN(numPlayers)) {
            ChatLib.chat(`ex: /${BigCommand.cmdName} floorstats m7 2`);
            return;
        }

        let temp = runData?.[T]?.[F]?.[numPlayers];
        
        if (!temp) {
            ChatLib.chat(`§cData not found for Type: §f${T}§c Floor: §f${F}§c with §f${numPlayers}§c Players`);
            return;
        }

        ChatLib.chat(`§7Stats for §${T == "F" ? "a" : "c"}${T}${F} §7with §f${numPlayers} §7players`);
        ChatLib.chat(`§7Runs§f: ${temp.num}`);
        ChatLib.chat(`§aFastest Run§f: ${Utils.secondsToFormatted(temp.fastest)}`);
        ChatLib.chat(`§dAverage Run§f: ${Utils.secondsToFormatted(temp.avg)}`);
        ChatLib.chat(`§6Slowest Run§f: ${Utils.secondsToFormatted(temp.slowest)}`);
    }
}


class DungeonSession {
    static CommandList = ["start", "end", "view"];
    
    static tabCompletion(text) {
        if (text == null || text == "") {
            return DungeonSession.CommandList;
        }
        text = text.toLowerCase();
        return DungeonSession.CommandList.filter(i => i.startsWith(text));
    }

    static viewFile(filename) {
        if (!FileLib.exists(`./config/ChatTriggers/modules/bigtracker/bigsessions/${filename}`)) {
            ChatLib.chat(`Session file not found`);
            return;
        }

        let tempData = new PogObject("bigtracker/bigsessions", {}, filename);
        ChatLib.chat(`&7>> &3Session on &f${new Date(tempData.startedAt).toString()}`);
        ChatLib.chat(`&7>> &9Runs&f: ${tempData.numRuns}`);
        ChatLib.chat(`&7>> &9Time Spent&f: ${Math.trunc(tempData.totalTime / 60000)} minutes`);
        ChatLib.chat(`&7>> &9Score&f: ${tempData.averageScore}`);
        ChatLib.chat(`&7>> &9Avg Time&f: ${Utils.secondsToFormatted(tempData.averageTime)}`);
        ChatLib.chat(`&7>> &9Teammates&f: ${tempData.teammates.join(", ")}`);
        ChatLib.chat(`&7>> &9Scores&f: ${tempData.scores.join(", ")}`);
        ChatLib.chat(`&7-------------&3Loot&7-------------`);
        for (let name of Object.keys(tempData.loot)) {
            ChatLib.chat(`&8${name}&7: &f${tempData.loot[name]}`);
        }
    }

    constructor() {
        this.numRuns = 0;
        this.loot = {};
        this.averageScore = 0;
        this.averageTime = 0;
        this.runTimes = [];
        this.scores = [];
        this.teammates = new Set();
        this.startedAt = Date.now();
    }

    view() {
        ChatLib.chat(`&3Current Session`);
        ChatLib.chat(`&7>> &9Runs&f: ${this.numRuns}`);
        ChatLib.chat(`&7>> &9Avg Time&f: ${(Date.now() - this.startedAt) / 60000} minutes`);
        ChatLib.chat(`&7>> &9Avg Score&f: ${this.averageScore}`);
    }

    endRun(time, score) {
        this.averageTime = Utils.calcMovingAvg(this.averageTime, this.numRuns, time);
        this.averageScore = Utils.calcMovingAvg(this.averageScore, this.numRuns, score);
        
        for (let name of Object.keys(ChatHandler.dungeon.partyMembers)) {
            this.teammates.add(name);
        }

        this.runTimes.push(time);
        this.scores.push(score);
        this.numRuns += 1;
    }

    saveSession() {
        if (!FileLib.exists("./config/ChatTriggers/modules/bigtracker/bigsessions")) {
            new File("./config/ChatTriggers/modules/bigtracker/bigsessions").mkdirs();
        }
        let fileName = `${Date.now()}.json`

        new PogObject("bigtracker/bigsessions", {
            startedAt: this.startedAt,
            numRuns: this.numRuns,
            loot: this.loot,
            averageScore: this.averageScore,
            averageTime: this.averageTime,
            runTimes: this.runTimes,
            scores: this.scores,
            teammates: Array.from(this.teammates),
            totalTime: Date.now() - this.startedAt
        }, fileName).save();

        Utils.chatMsgClickCMD(`&7>> &fSaved Dungeon Session`, `/${BigCommand.cmdName} session view ${fileName}`);
    }
}


register("command", (...args) => {
    if (!args?.[0]) {
        BigCommand.help();
        return;
    }

    args[0] = args[0].toLowerCase();

    switch (args[0]) {
        case "floorstats":
            BigCommand.floorStats(args);
            break;
        case "scoreboard":
            console.log(ChatHandler.dungeon.floor);
            break;
        case "dodge":
            BigCommand.dodge(args);
            break;
        case "note":
            BigCommand.note(args);
            break;
        case "list":
            BigCommand.printAllPlayers();
            break;
        case "loot":
        case "chests":
            BigCommand.loot(args[1]);
            break;
        case "autokick":
            data.autoKick = !data.autoKick;
            Utils.chatMsgClickCMD(`&7>> &fautokick ${data.autoKick ? "&aenabled" : "&cdisabled"}`, `/${BigCommand.cmdName} autokick`);
            data.save();
            break;
        case "sayreason":
            data.sayReason = !data.sayReason;
            Utils.chatMsgClickCMD(`&7>> &fsayreason ${data.sayReason ? "&aenabled" : "&cdisabled"}`, `/${BigCommand.cmdName} sayreason`);
            data.save();
            break;
        case "viewfile":
            BigCommand.viewFile(args);
            break;
        case "autostart":
            data.autoStartSession = !data.autoStartSession;
            Utils.chatMsgClickCMD(`&7>> &fauto start session ${data.autoStartSession ? "&aenabled" : "&cdisabled"}`, `/${BigCommand.cmdName} autostart`);
            data.save();
            break;
        case "session":
            BigCommand.session(args);
            break;
        case "namehistory":
            data.nameHistory = (data.nameHistory || 2) - 1;
            Utils.chatMsgClickCMD(`&7>> &fname history site set to ${data.nameHistory ? "&blaby" : "&enamemc"}`, `/${BigCommand.cmdName} namehistory`);
            break;
        default:
            BigCommand.view(args);
            break;
    }
}).setTabCompletions( (args) => {
        let name = "";

        if (!args || args.length == 0 || args?.[0]?.trim() == "") {
            return BigCommand.tabCommands;
        }

        if (args[0] == "session") {
            return DungeonSession.tabCompletion(args?.[1]);
        }
        
        let namesThatStartWith = [];
    
        tabCompleteNames.forEach(i => {
            if (i.startsWith((args[args.length - 1])?.toLowerCase())) {
                namesThatStartWith.push(i);
            }
        });

        if (args.length < 2) {
            BigCommand.tabCommands.forEach(i => {
                if (i.startsWith((args[args.length - 1])?.toLowerCase())) {
                    namesThatStartWith.push(i);
                }
            });
        }
    
        return namesThatStartWith;
}).setName(BigCommand.cmdName);


if (!FileLib.exists("./config/ChatTriggers/modules/bigtracker/bigplayers")) {
    new File("./config/ChatTriggers/modules/bigtracker/bigplayers").mkdirs();
}

if (data.firstTime) {
    data.firstTime = false;
    data.save();
    runData.save();

    if (FileLib.exists("./config/ChatTriggers/modules/bigtracker/players")) {
        let files = new File("./config/ChatTriggers/modules/bigtracker/players").list();
        for (let i = 0; i < files.length; i++) {
            try {
                let fileData = FileLib.read(`./config/ChatTriggers/modules/bigtracker/players/${files[i]}`);
                fileData = JSON.parse(fileData);
                let convert = {
                    UUID: fileData["UUID"],
                    USERNAME: fileData["USERNAME"],
                    NOTE: fileData["NOTE"],
                    DODGE: fileData["DODGE"],
                    DODGELENGTH: fileData["DODGELENGTH"],
                    DODGEDATE: fileData["DODGEDATE"],
                    RUNS: fileData["NUMRUNS"],
                    LASTRUN: fileData["LASTSESSION"],
                    DEATHS: fileData["DEATHS"],
                    pre4rate: (fileData?.["PRE4RATE"] || 0),
                    pre4raten: (fileData?.["PRE4RATEN"] || 0)
                }

                
                if (fileData["SSTRACKING"] && fileData["SSTRACKING"].length != 0) {
                    let tempSS = [];
                    fileData["SSTRACKING"].forEach(ss => tempSS.push([ss * 1000, ss * 20]));
                    convert["SS"] = tempSS;
                    convert["SSpb"] = [fileData["SSPB"] * 1000, fileData["SSPB"] * 20];
                }

                
                if (fileData["BRTRACKING"] && fileData["BRTRACKING"].length != 0) {
                    let tempBR = [];
                    fileData["BRTRACKING"].forEach(br => tempBR.push([br * 1000, br * 20]));
                    convert["BR"] = tempBR;
                }

                
                if (fileData["TERMSTRACKING"] && fileData["TERMSTRACKING"].length != 0) {
                    let tempTerms = [];
                    fileData["TERMSTRACKING"].forEach(terms => tempTerms.push([terms * 1000, terms * 20]));
                    convert["TERMS"] = tempTerms;
                    convert["TERMSpb"] = [fileData["TERMSPB"] * 1000, fileData["TERMSPB"] * 20];
                }

                
                if (fileData["RUNTIMETRACKING"] && fileData["RUNTIMETRACKING"].length != 0) {
                    let tempRun = [];
                    fileData["RUNTIMETRACKING"].forEach(run => tempRun.push([run * 1000, run * 20]));
                    convert["RUNDONE"] = tempRun;
                    convert["RUNDONEpb"] = [fileData["RUNPB"] * 1000, fileData["RUNPB"] * 20];
                }

                
                if (fileData["CAMPSTRACKING"] && fileData["CAMPSTRACKING"].length != 0) {
                    let tempCamp = [];
                    fileData["CAMPSTRACKING"].forEach(camp => tempCamp.push([camp * 1000, camp * 20]));
                    convert["CAMP"] = tempCamp;
                    convert["CAMPpb"] = [fileData["CAMPPB"] * 1000, fileData["CAMPPB"] * 20];
                }

                new BigPlayer(convert.UUID, convert.USERNAME, convert);
                console.log(`Successfully converted ${convert.USERNAME} to new system.`);
            } catch (e) {
                console.log(e);
            }
        }
    }
}


register("gameUnload", () => {
    if (BigCommand.dungeonSession != null) {
        BigCommand.dungeonSession.saveSession();
        BigCommand.dungeonSession = null;
    }
});

getFileTabCompleteNames();