/// <reference types="../CTAutocomplete" />

import PogObject from "../PogData";
import PlayerObject from "./PlayerObject";
import Dungeon from "../BloomCore/dungeons/Dungeon";
import request from "../requestV2";

const S02PacketChat = Java.type("net.minecraft.network.play.server.S02PacketChat");
const File = Java.type("java.io.File");

const data = new PogObject("bigtracker", {
    autoKick: false,
    sayReason: false,
    firstTime: true
}, "settings.json");


if (!FileLib.exists("./config/ChatTriggers/modules/bigtracker/players")) {
    new File("./config/ChatTriggers/modules/bigtracker/players").mkdirs();
}

if (data.firstTime) {
    if (FileLib.exists("./config/ChatTriggers/modules/bigtracker/list.json")) {
        ChatLib.chat("list data found. importing to bigtracker");
        try {
            let fileData = FileLib.read("./config/ChatTriggers/modules/bigtracker/list.json");
            fileData = JSON.parse(fileData)["list"];
            for (let UUID in fileData) {
                playerData[UUID] = new PlayerObject(UUID, fileData[UUID][0].toLowerCase(), fileData[UUID][1]);
            }
        } catch(e) {}
    }

    if (FileLib.exists("./config/ChatTriggers/modules/bigtracker/bigdata.json")) {
        const tempData = new PogObject("bigtracker", {}, "bigdata.json");
        let oldPlayerData = tempData["playerData"];
        
        for (let UUID in oldPlayerData) {
            let oldPlayer = oldPlayerData[UUID];
            // console.log(`${oldPlayer?.["lastKnown"]}`);

            new PlayerObject(UUID, oldPlayer?.["lastKnown"]?.toLowerCase(), oldPlayer?.["note"], oldPlayer?.["dodge"], oldPlayer?.["dodgeLength"],
                oldPlayer?.["dodgeDate"], oldPlayer?.["numRuns"], oldPlayer?.["lastSession"], oldPlayer?.["avgDeaths"], oldPlayer?.["avgSSTime"],
                oldPlayer?.["avgSSTimeN"], oldPlayer?.["pre4Rate"], oldPlayer?.["pre4RateN"], oldPlayer?.["ee3Rate"], oldPlayer?.["ee3RateN"],
                oldPlayer?.["avgRunTime"], oldPlayer?.["avgBR"], oldPlayer?.["avgBRN"], oldPlayer?.["avgCamp"], oldPlayer?.["avgCampN"], oldPlayer?.["avgTerms"], oldPlayer?.["avgTermsN"]
            )
        }
    }

    data.firstTime = false;
    data.save();

    new PlayerObject("bf47793e04ca4a5d98fcdddb63448bdb", "Falcon_17", "", true);

    if (World.isLoaded()) {
        ChatLib.command("big help", true);
    }
}


const playerData = {};
const namesToUUID = {};


const getPlayerDataByUUID = (UUID, NAME) => {
    if (playerData[UUID]) {
        let player = playerData[UUID];
        if (player.playerData.USERNAME != NAME) {
            ChatLib.chat(`${NAME} has changed its name from ${player.playerData.USERNAME}`);
            player.playerData.USERNAME = NAME;
        }
        return player;
    }

    playerData[UUID] = new PlayerObject(UUID, NAME.toLowerCase());
    return playerData[UUID];
}


const getPlayerDataByName = (NAME, task=false, extra=[]) => {
    NAME = NAME?.toLowerCase();
    if (!NAME) {
        return;
    }

    if (namesToUUID[NAME]) {
        let player = getPlayerDataByUUID(namesToUUID[NAME], NAME);
        if (task) {
            player.do(task, extra);
        }
        return player;
    }

    request(`https://api.mojang.com/users/profiles/minecraft/${NAME}`)
        .then(function(res) {
            const UUID = JSON.parse(res).id;
            NAME = JSON.parse(res).name?.toLowerCase();
            namesToUUID[NAME] = UUID;
            tabCompleteNames.add(NAME);
            let player = getPlayerDataByUUID(UUID, NAME);
            if (task) {
                player.do(task, extra);
            }
            return player; 
        }
    );
}


let partyMembers = {};
let gotAllMembers = false;
let runStart = 0;
let campStart = 0;
let termsStart = 0;
let ssDone = false;
let pre4Done = false;
let runDone = false;
let soloRun = false;
let isLeader = false;

register("worldLoad", () => {
    partyMembers = {};
    gotAllMembers = false;
    runStart = 0;
    campStart = 0;
    termsStart = 0;
    ssDone = false;
    pre4Done = false;
    runDone = false;
    soloRun = false;
    isLeader = false;
});


const getPartyMembers = () => {
    if (!Dungeon.inDungeon) return;
    if (gotAllMembers) return;

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

            // hopefully this still works for youtube ranks. it should.
            // [LVL] ?youtube? name ? (Class/Dead ?LVL)
            // /\[\d+\].* ([a-zA-Z0-9_]{3,16}) .*\((Archer|Mage|Tank|Berserk|Healer|DEAD|EMPTY).*\)/
            let match = line.match(/\[\d+\].* ([a-zA-Z0-9_]{3,16}) .*\((Archer|Mage|Tank|Berserk|Healer|DEAD|EMPTY).*\)/);
            let name = match[1]?.toLowerCase();
            let playerClass = match[2]?.trim();

            if (playerClass == "DEAD" || playerClass == "EMPTY") {
                deadPlayer = true;
            }

            tempPartyMembers[name] = playerClass;
        }
    }

    gotAllMembers = !deadPlayer;
    partyMembers = tempPartyMembers;
}


register("packetReceived", (packet, event) => {
    if (packet.func_148916_d()) return;
    if (soloRun) return;

    const chatComponent = packet.func_148915_c();
    const text = new String(chatComponent.func_150254_d().removeFormatting());

    if (text.match(/Party Finder > (.+) joined the dungeon group! .+/)) {
        const match = text.match(/Party Finder > (.+) joined the dungeon group! .+/);
        getPlayerDataByName(match[1], "check", [data.autoKick, data.sayReason, isLeader]);
    }
    else if (text == "[BOSS] Goldor: Who dares trespass into my domain?") {
        termsStart = Date.now();
        getPartyMembers();
    }
    else if (text.match(/\s+☠ Defeated Maxor, Storm, Goldor, and Necron in (\d+)m\s+(\d+)s/)) {
        if (runDone) return;
        const match = text.match(/\s+☠ Defeated Maxor, Storm, Goldor, and Necron in (\d+)m\s+(\d+)s/);
        const time = (parseInt(match[1]) * 60) + parseInt(match[2]);

        for (let name of Object.keys(partyMembers)) {
            getPlayerDataByName(name, "updateMovingAVG", ["AVGRUNTIME", "NUMRUNS", time]);
        }
        runDone = true;
    }
    else if (text.match(/☠(.+)/) && Dungeon.inDungeon && !(text.includes(" Defeated ") || text.includes("reconnected.") || text.includes(" disconnected "))) {
        let name = text.split(" ")[2].toLowerCase();
        if (text.includes(" You ")) name = Player.getName().toLowerCase();
        if (name.trim() == "") return;

        if (termsStart != 0 && !pre4Done && partyMembers?.[name] == "Berserk") {
            pre4Done = true; 
            getPlayerDataByName(name, "PRE4", 18);
        }
        getPlayerDataByName(name, "DEATHS");
    }
    else if (text.startsWith("[BOSS] The Watcher:")) {
        if (campStart === 0) {
            campStart = Date.now();
            let brTime = Date.now() - runStart;
            brTime /= 1000;
            // console.log(`brTime: ${brTime}`);

            if (brTime > 60) {
                brTime = 60;
            }

            brTime = parseFloat( brTime.toFixed(2) );
            getPartyMembers();

            for (let name of Object.keys(partyMembers)) {
                if (partyMembers[name] !== "Archer" && partyMembers[name] !== "Mage") {
                    continue;
                }

                getPlayerDataByName(name, "updateMovingAVG", ["AVGBR", "AVGBRN", brTime]);
            }
        }

        if (text == "[BOSS] The Watcher: You have proven yourself. You may pass.") {
            let campTime = Date.now() - campStart;
            campTime /= 1000;

            if (campTime > 85) {
                campTime = 85;
            }

            campTime = parseFloat( campTime.toFixed(2) );

            getPartyMembers();
            for (let name of Object.keys(partyMembers)) {
                if (partyMembers[name] !== "Mage") {
                    continue;
                }
                getPlayerDataByName(name, "updateMovingAVG", ["AVGCAMP", "AVGCAMPN", campTime]);
            }
        }
    }
    else if (text == "The Core entrance is opening!") {
        getPartyMembers();
        let termsTime = Date.now() - termsStart;
        termsTime /= 1000;
        termsTime = parseFloat( termsTime.toFixed(2) );

        if (termsTime > 70) {
            termsTime = 70;
        }

        for (let name of Object.keys(partyMembers)) {
            getPlayerDataByName(name, "updateMovingAVG", ["AVGTERMS", "AVGTERMSN", termsTime]);
        }
    }
    else if (text == "[NPC] Mort: Here, I found this map when I first entered the dungeon.") {
        runStart = Date.now();
        getPartyMembers();
        setTimeout( () => getPartyMembers(), 1000);
    }
    else if (text.match(/([a-zA-Z0-9_]{3,16}) completed a device!.+/)) {
        let completedIn = parseFloat(((Date.now() - termsStart) / 1000).toFixed(2));
        // console.log(`completedin> ${completedIn}`);
        const match = text.match(/([a-zA-Z0-9_]{3,16}) completed a device!.+/);
        const name = match[1].toLowerCase();
        let player = getPlayerDataByName(name);
        // console.log(`${name} >> ${partyMembers[name]} << ${completedIn}`)
        if (completedIn > 17) {
            completedIn = 17;
        }

        if (!ssDone && partyMembers[name] == "Healer") {
            if (completedIn != 17) ChatLib.chat(`SS Completed in ${completedIn}`);

            ssDone = true;
            getPlayerDataByName(name, "updateMovingAVG", ["AVGSSTIME", "AVGSSTIMEN", completedIn]);
        }

        if (!pre4Done && partyMembers[name] == "Berserk") {
            if (completedIn != 17) ChatLib.chat(`Pre4 Completed in ${completedIn}`);
            pre4Done = true;
            getPlayerDataByName(name, "PRE4", completedIn);
        }
    }
    else if (text == "Queueing your party...") {
        isLeader = true;
    }
}).setFilteredClass(S02PacketChat);


register("command", (...args) => {
    if (!args?.[0]) {
        commandHelp();
        return;
    }
  
    switch (args[0]) {
        case "help": {
            commandHelp();
            break;
        }
        case "import":
            importData(args?.[1]);
            break;
        case "export":
            exportData(args?.[1]);
            break;
        case "autokick": {
            data.autoKick = !data.autoKick;
            data.save();
            ChatLib.chat(`autokick ${data.autoKick ? "enabled" : "disabled"}`);
            break;
        }
        case "sayreason": {
            data.sayReason = !data.sayReason;
            data.save();
            ChatLib.chat(`say reason ${data.sayReason ? "enabled" : "disabled"}`);
            break;
        }
        case "get":
        case "view":
        case "check":
        case "see": {
            if (!args[1] || args[1] === undefined) {
                ChatLib.chat(`/big ${args[0]} username`);
                return;
            }
            getPlayerDataByName(args[1], "PRINTPLAYER");
            break;
        }
        case "dodge": {
            let username = args?.[1]?.toLowerCase();
            let length = Number(args?.[2]);
            let note;

            if(isNaN(length)) {
                note = args?.splice(2)?.join(" ");
            } else {
                note = args?.splice(3)?.join(" ");
            }

            if (!username) {
                ChatLib.chat("/big dodge <name> <days?> <note?>");
                return;
            }

            if (username == "party") {
                for (let name of Object.keys(partyMembers)) {
                    if (name == Player.getName()?.toLowerCase()) {
                        continue;
                    }
                    getPlayerDataByName(name, "dodge", [length, note]);
                }
            } else {
                getPlayerDataByName(username, "dodge", [length, note]);
            }
            
            break;
        }
        case "sstimes": {
            getSSTimes();
            break;
        }
        case "list":
        case "viewall":
        case "show":
        case "all": {
            printAll();
            break;
        }
        case "note": {
            getPlayerDataByName(args[1], "NOTE", args);
            break;
        }
        default: {
            getPlayerDataByName(args[0], "PRINTPLAYER");
        }
    }
}).setTabCompletions( (args) => {
    let name = "";

    if (args.length == 0 || args[0]?.trim() == "") {
        return tabCommands;
    }

    let namesThatStartWith = [];

    tabCompleteNames.forEach(i => {
        if (i.startsWith((args[args.length - 1])?.toLowerCase())) {
            namesThatStartWith.push(i);
        }
    });

    return namesThatStartWith;
}).setName("big");


const tabCommands = ["dodge", "note", "list", "help", "import", "export", "autokick", "sayreason", "get", "sstimes"];
const tabCompleteNames = new Set();

const getFileTabCompleteNames = () => {
    new Thread( () => {
        let fileNames = new File("./config/ChatTriggers/modules/bigtracker/players").list();
        for (let i = 0; i < fileNames.length; i++) {
            let player = new PlayerObject(fileNames[i].replace(".json", ""));
            tabCompleteNames.add(player.playerData.USERNAME);
        }
    }).start();
}

register("gameLoad", () => getFileTabCompleteNames());


const printAll = () => {
    let fileNames = new File("./config/ChatTriggers/modules/bigtracker/players").list();
    for (let i = 0; i < fileNames.length; i++) {
        let player = new PlayerObject(fileNames[i].replace(".json", ""));
        if (!player.playerData.DODGE && player.playerData.NOTE == "") continue;
        let playerString = `&7>> &b${player.playerData.USERNAME}&f:&7`
        if (player.playerData.NOTE !== "") {
            playerString += ` ${player.playerData.NOTE}`;
        }
        if (player.playerData.DODGE) {
            if (player.playerData.DODGELENGTH !== 0) {
                let timeLeft = Date.now() - player.playerData.DODGEDATE;
                timeLeft /= 1000; // seconds
                timeLeft /= 60; // minutes
                timeLeft /= 60; // hours
                timeLeft /= 24; // days
                timeLeft = parseFloat( (player.playerData.DODGELENGTH - timeLeft).toFixed(1) );
                playerString += ` (dodged; ${timeLeft} days remaining)`;
            } else {
                playerString += ` (dodged)`;
            }
        }
        ChatLib.chat(playerString);
    }
}


register("step", () => {
    if (!Dungeon.inDungeon || gotAllMembers) return;
    getPartyMembers();
}).setFps(1);


const commandHelp = () => {
    ChatLib.chat("/big help &7<- this");
    ChatLib.chat("/big <name> &7<- view stored info about a player");
    ChatLib.chat("/big dodge <name> <days?> <note?>&7<- mark player as dodged. optionally add num of days to dodge the player for. dodge again to undodge.");
    ChatLib.chat("/big list &7<- view all players with notes");
    ChatLib.chat("/big note <name> <note> &7<- add or remove a note about a player");
    ChatLib.chat("/big autokick &7<- autokick dodged players");
    ChatLib.chat("/big sayreason &7<- say note in chat when autokicking someone");
    ChatLib.chat("/big sstimes &7<- print all players average ss times from fastest to slowest");
    ChatLib.chat("/big dodge <name> <days?> <note?> &7<- shortcut for /big dodge");
}


const getSSTimes = () => {
    let fileNames = new File("./config/ChatTriggers/modules/bigtracker/players").list();
    let sortedSSTimes = [];
    for (let i = 0; i < fileNames.length; i++) {
        let player = new PlayerObject(fileNames[i].replace(".json", ""));
        if (!player.playerData?.SSTRACKING?.length) {
            continue;
        }
        let ssTime = player.getMedian("SSTRACKING");
        if (ssTime == 0.0) {
            continue;
        }
        sortedSSTimes.push([player.playerData.USERNAME, ssTime, player.playerData.SSPB, player.playerData.SSTRACKING.length]);
    }

    sortedSSTimes.sort((a,b) => a[1] - b[1]);
    sortedSSTimes.forEach(p => {
        ChatLib.chat(`${p[0]}: ${p[1]} (${p[2]}) [${p[3]}]`);
    });
}


const exportData = (filename="export") => {
    let fileNames = new File("./config/ChatTriggers/modules/bigtracker/players").list();
    const allPlayerData = [];
    for (let i = 0; i < fileNames.length; i++) {
        let player = new PlayerObject(fileNames[i].replace(".json", ""));
        allPlayerData.push(player.playerData);
    }
    FileLib.write(`./config/ChatTriggers/modules/bigtracker/${filename}.json`, JSON.stringify(allPlayerData), true);
    ChatLib.chat(`&aSuccessfully exported to ${filename}.json`);
}


const importData = (filename="export") => {
    if (filename.includes(".json")) filename = filename.replace(".json", "");
    if (!FileLib.exists(`./config/ChatTriggers/modules/bigtracker/${filename}.json`)) {
        ChatLib.chat("To import, bring a export.json into your bigtracker folder then run this command.");
        ChatLib.chat("Alternatively, if the file has a different name then /big import filename");
        return;
    }
    try {
        let fileData = FileLib.read("./config/ChatTriggers/modules/bigtracker/export.json");
        fileData = JSON.parse(fileData);
        for (let i = 0; i < fileData.length; i++) {
            let UUID = fileData[i].UUID;
            if (FileLib.exists(`./config/ChatTriggers/modules/bigtracker/players/${UUID}.json`)) {
                let filePlayer = fileData[i];
                let player = getPlayerDataByUUID(UUID, fileData[i].USERNAME);
                tabCompleteNames.add(player.USERNAME);
                if (player.playerData.NOTE == "") player.playerData.NOTE = filePlayer.NOTE;
                if (!player.playerData.DODGE) {
                    player.playerData.DODGE = filePlayer.DODGE;
                    player.playerData.DODGELENGTH = filePlayer.DODGELENGTH;
                    player.playerData.DODGEDATE = filePlayer.DODGEDATE;
                }
                if (player.playerData.SSPB > filePlayer.SSPB) player.playerData.SSPB = filePlayer.SSPB;
                if (player.playerData.TERMSPB > filePlayer.TERMSPB) player.playerData.TERMSPB = filePlayer.TERMSPB;
                if (player.playerData.RUNPB > filePlayer.RUNPB) player.playerData.RUNPB = filePlayer.RUNPB;
                if (player.playerData.CAMPPB > filePlayer.CAMPPB) player.playerData.CAMPPB = filePlayer.CAMPPB;
                player.save();
            } else {
                new PlayerObject(fileData[i].UUID, fileData[i].USERNAME, fileData[i].NOTE, fileData[i].DODGE, fileData[i].DODGELENGTH, fileData[i].DODGEDATE, fileData[i].NUMRUNS, fileData[i].LASTSESSION, fileData[i].DEATHS, fileData[i].AVGSSTIME, fileData[i].AVGSSTIMEN, fileData[i].PRE4RATE, fileData[i].PRE4RATEN, fileData[i].EE3RATE, fileData[i].EE3RATEN, fileData[i].AVGRUNTIME, fileData[i].AVGBR, fileData[i].AVGBRN, fileData[i].AVGCAMP, fileData[i].AVGCAMPN, fileData[i].AVGTERMS, fileData[i].AVGTERMSN, fileData[i].SSPB, fileData[i].TERMSPB, fileData[i].RUNPB, fileData[i].CAMPPB, fileData[i].SSTRACKING, fileData[i].TERMSTRACKING, fileData[i].BRTRACKING, fileData[i].RUNTIMETRACKING);
            }
        }
    } catch(e) {
        console.log(e);
    }
}

