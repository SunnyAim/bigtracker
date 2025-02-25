import PogObject from "../PogData";
import request from "../requestV2";

const S02PacketChat = Java.type("net.minecraft.network.play.server.S02PacketChat");
const S32PacketConfirmTransaction = Java.type("net.minecraft.network.play.server.S32PacketConfirmTransaction");
const C0EPacketClickWindow = Java.type("net.minecraft.network.play.client.C0EPacketClickWindow");
const File = Java.type("java.io.File");

const playerData = {};
const namesToUUID = {};
const tabCompleteNames = new Set();

const data = new PogObject("temptracker", {
    firstTime: true
}, "settings.json");

const runData = new PogObject("temptracker", {
    chests: {}
}, "bigloot.json");


if (data.firstTime) {
    data.firstTime = false;
    data.save();
    runData.save();

    if (!FileLib.exists("./config/ChatTriggers/modules/temptracker/bigplayers")) {
        new File("./config/ChatTriggers/modules/temptracker/bigplayers").mkdirs();
    }
}


const getPlayerByName = (name, task=null, extra=null) => {
    name = name?.toLowerCase();

    if (!name || name?.trim() == "") {
        return;
    }
    
    if (namesToUUID?.[name] && playerData[namesToUUID[name]]) {
        playerData[namesToUUID[name]].doTask(task, extra);
    }

    request(`https://api.mojang.com/users/profiles/minecraft/${name}`)
        .then(function(res) {
            const UUID = JSON.parse(res)?.id;
            NAME = JSON.parse(res)?.name?.toLowerCase();
            namesToUUID[name] = UUID;
            tabCompleteNames.add(name);

            let player = new BigPlayer(UUID, name);
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
        if (text.match(/\s+(WOOD|GOLD|EMERALD|OBSIDIAN|BEDROCK) CHEST REWARDS/)) {
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
                if (!runData["chests"][ChatHandler.lastGuiName]?.[type]) {
                    runData["chests"][ChatHandler.lastGuiName][type] = amt;
                } else {
                    runData["chests"][ChatHandler.lastGuiName][type] += amt;
                }
            } else {
                text = text.trim();
                if (!runData["chests"][ChatHandler.lastGuiName]?.[text]) {
                    runData["chests"][ChatHandler.lastGuiName][text] = 1;
                } else {
                    runData["chests"][ChatHandler.lastGuiName][text] += 1;
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
                    num: 1
                }
            } else {
                let temp = runData[t][f][nPartyMembers];
                if (time < temp.fastest) {
                    temp.fastest = time;
                }
                if (time > temp.slowest) {
                    temp.slowest = time;
                }
                temp.avg = Utils.calcMovingAvg(temp.avg, temp.num, time);
                temp.num += 1;
                runData[t][f][nPartyMembers] = temp;
            }

            runData.save();

            if (f == 7) {
                ChatHandler.dungeon.endRun(time);
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
        DODGE: "DODGE"
    });

    constructor(UUID, username="") {
        this.playerData = new PogObject("temptracker/bigplayers", {
            UUID: UUID,
            USERNAME: username?.toLowerCase()
        }, `${UUID}.json`);

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
                break;
            case BigPlayer.TaskType.UPDATE:
                this.updateTime(extra[0], extra[1], extra[2]);
                break;
            case BigPlayer.TaskType.PRE4:
                this.pre4(extra);
                break;
            case BigPlayer.TaskType.DEATH:
                if (!this.playerData?.["DEATHS"]) {
                    this.playerData["DEATHS"] = 0;
                }
                this.playerData["DEATHS"] += 1;
                this.save();
                break;
            case BigPlayer.TaskType.PRINT:
                this.printPlayer();
                break;
            case BigPlayer.TaskType.RUNDONE:
                let runTimeMS = ChatHandler.dungeon.split[DungeonRun.SplitType.END][DungeonRun.SplitType.RUN][0] - ChatHandler.dungeon.split[DungeonRun.SplitType.START][DungeonRun.SplitType.RUN][0];
                let runTimeTicks = ChatHandler.dungeon.split[DungeonRun.SplitType.END][DungeonRun.SplitType.RUN][1] - ChatHandler.dungeon.split[DungeonRun.SplitType.START][DungeonRun.SplitType.RUN][1];
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
            default:
                break;
        }
    }

    note(noteStr="") {
        if (noteStr == "") {
            this.playerData["NOTE"] = "";
            ChatLib.chat(`&7>> &fCleared note for ${this.playerData["USERNAME"]}`);
        } else {
            this.playerData["NOTE"] = noteStr;
            ChatLib.chat(`&b${this.playerData["USERNAME"]}`);
            ChatLib.chat(`&8Note &7>> &f${this.playerData["NOTE"]}`);
        }
    }

    printPlayer() {
        Utils.chatMsgClickURL(`&7>> &b${this.playerData["USERNAME"]}`, `https://namemc.com/search?q=${this.playerData["UUID"]}`);
        if (this.playerData?.["CLASS"] != undefined) {
            ChatLib.chat(`&8Class &7>> &f${this.playerData["CLASS"]}`);
        }

        if (this.playerData?.["NOTE"] != undefined && this.playerData["NOTE"] != "") {
            ChatLib.chat(`&9Note &7>> &f${this.playerData["NOTE"]}`);
        }

        if (this.playerData?.["DODGE"]) {
            if (this.playerData?.["DODGELENGTH"]) {
                let timeLeft = Date.now() - this.playerData["DODGEDATE"];
                timeLeft /= 8640000; //86400000
                timeLeft = Math.round(timeLeft) / 10;
                ChatLib.chat(`&7>> &bDodged&7; &f${timeLeft} days remaining`);
            }
            else {
                ChatLib.chat(`&7>> &bDodged`);
            }
        }

        if (this.playerData?.["RUNS"]) {
            ChatLib.chat(`&8Runs &7>> &f${this.playerData["RUNS"]}`);

            if (this.playerData?.["DEATHS"]) {
                ChatLib.chat(`&8DPR &7>> &f${(this.playerData["DEATHS"] / this.playerData["RUNS"]).toFixed(2)}`);
            }

            if (this.playerData?.["LASTRUN"]) {
                ChatLib.chat(`&8Last Run &7>> &f${Math.round(ms / 8640000) / 10}d ago`);
            }

            let pbString = "&9PBs &7>> ";

            if (this.playerData?.["SSpb"]) {
                pbString += "&fSS: [";
                let pbSS = this.playerData["SSpb"];
                if (pbSS[0] < 12) pbString += `&a`;
                else if (pbSS[0] < 13) pbString += `&e`;
                else pbString += `&c`;
                pbString += `${pbSS[0]}, ${pbSS[1]}&f] &7| &r`;
            }

            if (this.playerData?.["TERMSpb"]) {
                pbString += "&fTerms: [";
                let pbTerms = this.playerData["TERMSpb"];
                if (pbTerms < 40) pbString += `&a`;
                else if (pbTerms < 45) pbString += `&e`;
                else pbString += `&c`;
                pbString += `${pbTerms}&f] &7| &r`;
            }

            if (this.playerData?.["RUNDONEpb"]) {
                pbString += "&fRun: [";
                let pbRun = this.playerData["RUNDONEpb"];
                if (pbRun[0] < 310) pbString += `&a`;
                else if (pbRun[0] < 330) pbString += `&e`;
                else pbString += `&c`;
                pbString += `${pbRun[0]}, ${pbRun[1]}&f] &7| &r`;
            }

            if (this.playerData?.["CAMPpb"]) {
                pbString += "&fCamp: [";
                let pbCamp = this.playerData["CAMPpb"];
                if (pbCamp[0] < 61) pbString += `&a`;
                else if (pbCamp[0] < 65) pbString += `&e`;
                else pbString += `&c`;
                pbString += `${pbCamp[0]}, ${pbCamp[1]}&f] &7| &r`;
            }

            if (pbString != "&9PBs &7>> ") {
                ChatLib.chat(pbString);
            }


            let medString = "&9AVGs &7>> ";

            if (this.playerData?.["SS"]?.length) {
                let avgSS = this.getAvgOfType(BigPlayer.TaskType.SS);
                medString += "&fSS: [";
                if (avgSS[0] < 13) medString += `&a`;
                else if (avgSS[0] < 14) medString += `&e`;
                else medString += `&c`;
                medString += `${avgSS[0]}, ${avgSS[1]}&f] &7| &r`;
            }

            if (this.playerData?.["BR"]?.length) {
                let avgBR = this.getAvgOfType(BigPlayer.TaskType.BR);
                medString += "&fBR: [";
                if (avgBR[0] < 25) medString += `&a`;
                else if (avgBR[0] < 32) medString += `&e`;
                else medString += `&c`;
                medString += `${avgBR[0]}, ${avgBR[1]}&f] &7| &r`;
            }

            if (this.playerData?.["CAMP"]?.length) {
                let avgCamp = this.getAvgOfType(BigPlayer.TaskType.CAMP);
                medString += "&fCamp: [";
                if (avgCamp[0] < 66) medString += `&a`;
                else if (avgCamp[0] < 70) medString += `&e`;
                else medString += `&c`;
                medString += `${avgCamp[0]}, ${avgCamp[1]}&f] &7| &r`;
            }

            if (this.playerData?.["TERMS"]?.length) {
                let avgTerms = this.getAvgOfType(BigPlayer.TaskType.TERMS);
                medString += "&fTerms: [";
                if (avgTerms[0] < 45) medString += `&a`;
                else if (avgTerms[0] < 51) medString += `&e`;
                else medString += `&c`;
                medString += `${avgTerms[0]}, ${avgTerms[1]}&f] &7| &r`;
            }

            if (this.playerData?.["RUNDONE"]?.length) {
                let avgRun = this.getAvgOfType(BigPlayer.TaskType.RUNDONE);
                medString += "&fRun: [";
                if (avgRun[0] < 330) medString += `&a`;
                else if (avgRun[0] < 360) medString += `&e`;
                else medString += `&c`;
                medString += `${avgRun[0]}, ${avgRun[1]}&f] &7| &r`;
            }

            if (medString != "&9AVGs &7>> ") {
                ChatLib.chat(medString);
            }

            if (this.playerData?.["pre4raten"]) {
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
        
        if (this.playerData[updateType + "pb"][0] > compMS) {
            this.playerData[updateType + "pb"] = [compMS, compTicks];
        }
    }

    getAvgOfType(updateType) {
        if (!this.playerData?.[updateType]) {
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
        if (!this.playerData.pre4raten) {
            this.playerData.pre4rate = 0;
            this.playerData.pre4raten = 0;
        }

        if (extra) {
            this.playerData.pre4rate += 1;
        }

        this.playerData.pre4raten += 1;
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
        // start run -> nothing
        // start camp -> update avg br for arch and mage
        // end camp -> update avg camp for mage
        // start terms -> nothing
        // end terms -> update avg terms for everyone, maybe print splits/ticktime? idk
        // end run -> nothing.

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
    static tabCommands = ["floorstats", "scoreboard", "note", "dodge"];
    static cmdName = "large";

    static help = () => {
        
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
            ChatLib.chat("ex: /big floorstats m7");
            return;
        }

        let T = args[1].charAt(0).toUpperCase();
        let F = parseInt(args[1].charAt(1));
        let numPlayers = 5;
        if (args?.[2]) {
            numPlayers = parseInt(args[2]);
        }

        if (NaN(F) || NaN(numPlayers)) {
            ChatLib.chat("ex: /big floorstats m7 2");
            return;
        }

        let temp = runData?.[T]?.[F]?.[numPlayers];
        
        if (!temp) {
            ChatLib.chat(`Data not found for ${T} ${F} ${numPlayers}`);
            return;
        }

        ChatLib.chat(`Stats for ${T}${F} with ${numPlayers} players`);
        ChatLib.chat(`Runs: ${temp.num}`);
        ChatLib.chat(`Fastest Run: ${Utils.secondsToFormatted(temp.fastest)}`);
        ChatLib.chat(`Average Run: ${Utils.secondsToFormatted(temp.avg)}`);
        ChatLib.chat(`Slowest Run: ${Utils.secondsToFormatted(temp.slowest)}`);
    }

    static tabCompletion = (args) => {
        let name = "";

        if (args.length == 0 || args?.[0]?.trim() == "") {
            return BigCommand.tabCommands;
        }
        
        let namesThatStartWith = [];
    
        tabCompleteNames.forEach(i => {
            if (i.startsWith((args[args.length - 1])?.toLowerCase())) {
                namesThatStartWith.push(i);
            }
        });
    
        return namesThatStartWith;
    }
}


register("command", (...args) => {
    if (!args?.[0]) {
        BigCommand.help();
        return;
    }

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
        default:
            BigCommand.view(args);
            break;
    }
    

}).setName(BigCommand.cmdName).setTabCompletions( (args) => {
    return BigCommand.tabCompletion(args);
});
