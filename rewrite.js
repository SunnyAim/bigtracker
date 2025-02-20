import PogObject from "../PogData";
import request from "../requestV2";

const S02PacketChat = Java.type("net.minecraft.network.play.server.S02PacketChat");
const S32PacketConfirmTransaction = Java.type("net.minecraft.network.play.server.S32PacketConfirmTransaction");

const tick = new OnTick();
const playerData = {};
const namesToUUID = {};
const tabCompleteNames = new Set();


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
            getPlayerDataByName(match[1], BigPlayer.TaskType.CHECK);
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
                let compMS = Date.now() - ChatHandler.dungeon.splits["start"]["terms"][0];
                let compTicks = tick.getTotalTicks() - ChatHandler.dungeon.splits["start"]["terms"][1];

                getPlayerByName(name, BigPlayer.TaskType.UPDATE, [BigPlayer.TaskType.SS, compMS, compTicks]);
                ChatHandler.dungeon.ssDone = true;
                return;
            }

            if (!ChatHandler.dungeon.pre4Done && ChatHandler.dungeon.partyMembers[name] == "Berserk") {
                getPlayerByName(name, BigPlayer.TaskType.PRE4, true);
                ChatHandler.dungeon.pre4Done = true;
                return;
            }
        }

        if (text == "The Core entrance is opening!") {
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.TERMS, DungeonRun.SplitType.END);
            return;
        }

        if (text.match(/\s+☠ Defeated Maxor, Storm, Goldor, and Necron in (\d+)m\s+(\d+)s/)) {
            if (ChatHandler.dungeon.runDone) {
                return;
            }

            let match = text.match(/\s+☠ Defeated Maxor, Storm, Goldor, and Necron in (\d+)m\s+(\d+)s/);
            let time = (parseInt(match[1]) * 60) + parseInt(match[2]);

            ChatHandler.dungeon.endRun(time);
            return;
        }
    }
}


class BigPlayer {
    constructor(UUID, username="") {
        this.playerData = new PogObject("bigtracker/players", {
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
        RUNDONE: "rundone"
    });

    doTask(task=null, extra=null) {
        if (task == null && extra == null) {
            return;
        }

        switch (task) {
            case TaskType.CHECK:
                break;
            case TaskType.UPDATE:
                this.updateMovingAvg(extra[0], extra[1]);
                break;
            case TaskType.PRE4:
                this.pre4(extra);
                break;
        }
    }
    
    updateMovingAvg(updateType, compMS) {
        let updateTypeN = updateType + "n";
        let updateTypePB = updateType + "pb";

        if (!this.playerData[updateTypeN]) {
            this.playerData[updateTypeN] = 1;
            this.playerData[updateType] = compMS;
            this.playerData[updateTypePB] = compMS;
            this.save();
            return;
        }
        
        this.playerData[updateTypeN] += 1;
        let newAvg = (this.playerData[updateType] * (this.playerData[updateTypeN] - 1) / this.playerData[updateTypeN] + (compMS / this.playerData[updateTypeN])).toFixed(2);
        newAvg = parseFloat(newAvg);

        
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
        this.splits[or][type] = [Date.now(), totalTicks];
    }

    endRun(time) {
        ChatHandler.dungeon.runDone = true;

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


register("packetReceived", (packet, event) => {
    if (packet.func_148916_d()) return;
    if (DungeonRun) return;

    const chatComponent = packet.func_148915_c();
    const text = new String(chatComponent.func_150254_d().removeFormatting());

    ChatHandler.runText(text);
}).setFilteredClass(S02PacketChat);


register("packetReceived", (packet, event) => {
    tick.do();
}).setFilteredClass(S32PacketConfirmTransaction);
