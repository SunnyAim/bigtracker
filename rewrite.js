import PogObject from "../PogData";
import request from "../requestV2";

const S02PacketChat = Java.type("net.minecraft.network.play.server.S02PacketChat");
const S32PacketConfirmTransaction = Java.type("net.minecraft.network.play.server.S32PacketConfirmTransaction");
const File = Java.type("java.io.File");

const playerData = {};
const namesToUUID = {};
const tabCompleteNames = new Set();

const data = new PogObject("temptracker", {
    firstTime: true
}, "settings.json");

const runData = new PogObject("temptracker", {}, "bigloot.json");


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
});


class ChatHandler {
    static dungeon = null;

    static runText(text) {
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
            let scoreboardFloor = Utils.findScoreboardFloor();
            let t = scoreboardFloor[0];
            let f = scoreboardFloor[1];

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
                temp.avg = Utils.calcMovingAvg(temp.avg, temp.num);
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
        
            if (!ChatHandler.dungeon.pre4Done && ChatHandler.dungeon.splits[DungeonRun.SplitType.START]?.[DungeonRun.SplitType.TERMS] && partyMembers?.[name] == "Berserk") {
                ChatHandler.dungeon.pre4Done = true; 
                getPlayerByName(name, BigPlayer.TaskType.PRE4, false);
            }
            
            getPlayerByName(name, BigPlayer.TaskType.DEATH);
        }
    }
}


class BigPlayer {
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

    static TaskType = Object.freeze({
        CHECK: "check",
        UPDATE: "update",
        SS: "ss",
        PRE4: "pre4",
        TERMS: "terms",
        RUNDONE: "rundone",
        DEATH: "death"
    });

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
    constructor() {
        this.partyMembers = {};
        this.gotAllMembers = false;
        this.splits = {
            "start": {},
            "end": {}
        };
        this.ssDone = false;
        this.pre4Done = false;
        this.soloRun = false;
        this.numPartyMembers = null;
        this.runDone = false;
        this.doSplit(DungeonRun.SplitType.RUN, DungeonRun.SplitType.START);
    }

    static SplitType = Object.freeze({
        START: "start",
        END: "end",
        RUN: "run",
        CAMP: "camp",
        TERMS: "terms"
    });

    doSplit(type, or) {
        this.splits[or][type] = [Date.now(), tick.getTotalTicks()];
        // start run -> nothing
        // start camp -> update avg br for arch and mage
        // end camp -> update avg camp for mage
        // start terms -> nothing
        // end terms -> update avg terms for everyone, maybe print splits/ticktime? idk
        // end run -> nothing. not a thing here.

        switch (or) {
            case SplitType.START:
                switch (type) {
                    case SplitType.CAMP:
                        break;
                }
                break;


            case SplitType.END:
                break;
        }
    }

    endRun(time) {
        for (let name of Object.keys(this.partyMembers)) {
            getPlayerByName(name, BigPlayer.TaskType.RUNDONE, time);
        }
    }

    getPartyMembers = () => {
        if (this.gotAllMembers && !this.soloRun) return;
    
        const Scoreboard = TabList?.getNames();
        if (!Scoreboard || Scoreboard?.length === 0) return;
    
        let numMembers = parseInt(Scoreboard[0]?.charAt(28));
        let deadPlayer = false;
        let tempPartyMembers = {};
    
        soloRun = numMembers == 1;
    
        for (let i = 1; i < Scoreboard.length; i++) {
            if (Object.keys(tempPartyMembers).length === numMembers || Scoreboard[i].includes("Player Stats")) {
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
    static calcMovingAvg = (t, n) => {
        return t * n / (n + 1) + (t / (n + 1));
    }

    static msgToFloor = {
        "Maxor, Storm, Goldor, and Necron": 7,
        "Sadan": 6,
        "Livid": 5,
        "Thorn": 4,
        "The Professor": 3,
        "Scarf": 2,
        "Bonzo": 1,
        "The Watcher": 0
    }

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
    if (packet.func_148916_d()) return;

    const chatComponent = packet.func_148915_c();
    const text = new String(chatComponent.func_150254_d().removeFormatting());

    ChatHandler.runText(text);
}).setFilteredClass(S02PacketChat);


register("packetReceived", (packet, event) => {
    tick.do();
}).setFilteredClass(S32PacketConfirmTransaction);


class BigCommand {
    static tabCommands = ["floorstats"];

    static help = () => {
        
    }

    static floorStats = (args) => {
        if (!args?.[1]) {
            ChatLib.chat("ex: /big floorstats m7");
            return;
        }

        let T = args[1].charAt(0).toUpperCase();
        let F = parseInt(args[1].charAt(1));
        let numPlayers = 5;
        if (!(!args?.[2])) {
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
    }
    

}).setName("large").setTabCompletions( (args) => {
    return BigCommand.tabCompletion(args);
});