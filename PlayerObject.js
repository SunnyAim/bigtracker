/// <reference types="../CTAutocomplete" />

import PogObject from "../PogData";

export default class PlayerObject {
    constructor(UUID, username="unknown", note="", dodge=false, dodgeLength=0, dodgeDate=0, numRuns=0, lastSession=Date.now(), avgDeaths=0, avgSSTime=0, avgSSTimeN=0,
                pre4Rate=0, pre4RateN=0, ee3Rate=0, ee3RateN=0, avgRunTime=0, avgBr=0, avgBrN=0, avgCamp=0, avgCampN=0, avgTerms=0, avgTermsN=0,
                ssPB=17, termsPB=80, runPB=1000, campPB=100) {
        this.playerData = new PogObject("bigtracker/players", {
            UUID: UUID,
            USERNAME: username?.toLowerCase(),
            NOTE: note,
            DODGE: dodge,
            DODGELENGTH: dodgeLength,
            DODGEDATE: dodgeDate,
            NUMRUNS: numRuns,
            LASTSESSION: lastSession,
            DEATHS: avgDeaths,
            AVGSSTIME: avgSSTime,
            AVGSSTIMEN: avgSSTimeN,
            PRE4RATE: pre4Rate,
            PRE4RATEN: pre4RateN,
            EE3RATE: ee3Rate,
            EE3RATEN: ee3RateN,
            AVGRUNTIME: avgRunTime,
            AVGBR: avgBr,
            AVGBRN: avgBrN,
            AVGCAMP: avgCamp,
            AVGCAMPN: avgCampN,
            AVGTERMS: avgTerms,
            AVGTERMSN: avgTermsN,
            SSPB: ssPB,
            TERMSPB: termsPB,
            RUNPB: runPB,
            CAMPPB: campPB,
            SSTRACKING: [],
            TERMSTRACKING: [],
            CAMPSTRACKING: [],
            BRTRACKING: [],
            RUNTIMETRACKING: []
        }, `${UUID}.json`);

        this.save();
    }

    save() {
        this.playerData.save();
    }

    printPlayer() {
        ChatLib.chat(`&7>> &b${this.playerData.USERNAME}`);

        if (this.playerData.NOTE != "") {
            ChatLib.chat(`&9Note &7>> &f${this.playerData.NOTE}`);
        }

        if (this.playerData.DODGE) {
            let playerString = ""
            if (this.playerData.DODGELENGTH != 0) {
                let timeLeft = Date.now() - this.playerData.DODGEDATE;
                timeLeft /= 1000; // seconds
                timeLeft /= 60; // minutes
                timeLeft /= 60; // hours
                timeLeft /= 24; // days
                timeLeft = parseFloat( (this.playerData.DODGELENGTH - timeLeft).toFixed(1) );
                playerString += `dodged; ${timeLeft} days remaining`;
            } else {
                playerString += `dodged`;
            }
            ChatLib.chat(playerString);
        }

        if (this.playerData.NUMRUNS != 0) {
            ChatLib.chat(`&9Runs &7>> &f${this.playerData.NUMRUNS}`);
            ChatLib.chat(`&9DPR &7>> ${(this.playerData.DEATHS / this.playerData.NUMRUNS) < 1 ? "&a" : "&c"}${(this.playerData.DEATHS / this.playerData.NUMRUNS).toFixed(1)}`);
            ChatLib.chat(`&9Last Run &7>> &f${(((Date.now() - this.playerData.LASTSESSION) / 1000) / 60 / 60 / 24).toFixed(1)} days ago`);

            let pbString = "&9PBs &7>> ";

            if (this.playerData.SSPB != 17) {
                pbString += `&fSS: `;
                let pbSS = parseFloat(this.playerData.SSPB);
                if (pbSS < 12) pbString += `&a${pbSS}`;
                else if (pbSS < 13) pbString += `&e${pbSS}`;
                else pbString += `&c${pbSS}`;
                pbString += " &7| &r";
            }

            if (this.playerData.TERMSPB != 80) {
                pbString += `&fTERMS: `;
                let pbTerms = parseFloat(this.playerData.TERMSPB);
                if (pbTerms < 40) pbString += `&a${pbTerms}`;
                else if (pbTerms < 45) pbString += `&e${pbTerms}`;
                else pbString += `&c${pbTerms}`;
                pbString += " &7| &r";
            }

            if (this.playerData.RUNPB != 1000) {
                pbString += `&fRUN: `;
                let pbRun = parseFloat(this.playerData.RUNPB);
                if (pbRun < 310) pbString += `&a${pbRun}`;
                else if (pbRun < 330) pbString += `&e${pbRun}`;
                else pbString += `&c${pbRun}`;
                pbString += " &7| &r";
            }

            if (this.playerData.CAMPPB != 100) {
                pbString += `&fCAMP: `;
                let pbCamp = parseFloat(this.playerData.CAMPPB);
                if (pbCamp < 61) pbString += `&a${pbCamp}`;
                else if (pbCamp < 65) pbString += `&e${pbCamp}`;
                else pbString += `&c${pbCamp}`;
                pbString += " &7| &r";
            }

            if (pbString != "&9PBs &7>> ") {
                ChatLib.chat(pbString);
            }
        } else {
            ChatLib.chat("no runs");
        }

        this.playerDataCheck();

        let medString = "&9AVGs &7>> ";

        if (this.playerData.SSTRACKING.length != 0) {
            medString += `&fSS: `;
            let medSS = parseFloat(this.getMedian("SSTRACKING"));
            if (medSS < 13.0) medString += `&a${medSS}`;
            else if (medSS < 14.0) medString += `&e${medSS}`;
            else medString += `&c${medSS}`;
            medString += " &7| &r";
        }

        if (this.playerData.BRTRACKING.length != 0) {
            medString += `&fBR: `;
            let medBR = parseFloat(this.getMedian("BRTRACKING"));
            if (medBR < 25.0) medString += `&a${medBR}`;
            else if (medBR < 32.0) medString += `&e${medBR}`;
            else medString += `&c${medBR}`;
            medString += " &7| &r";
        }

        if (this.playerData.CAMPSTRACKING.length != 0) {
            medString += `&fCAMP: `;
            let medCamp = parseFloat(this.getMedian("CAMPSTRACKING"));
            if (medCamp < 66.0) medString += `&a${medCamp}`;
            else if (medCamp < 70.0) medString += `&e${medCamp}`;
            else medString += `&c${medCamp}`;
            medString += " &7| &r";
        }

        if (this.playerData.TERMSTRACKING.length != 0) {
            medString += `&fTERMS: `;
            let medTerms = parseFloat(this.getMedian("TERMSTRACKING"));
            if (medTerms < 45.0) medString += `&a${medTerms}`;
            else if (medTerms < 52.0) medString += `&e${medTerms}`;
            else medString += `&c${medTerms}`;
            medString += " &7| &r";
        }

        if (this.playerData.RUNTIMETRACKING.length != 0) {
            medString += `&fRUNTIME: `;
            let runTimeMed = parseFloat(this.getMedian("RUNTIMETRACKING"));
            let formattedRuntime = `${Math.trunc(runTimeMed / 60)}m ${(runTimeMed % 60).toFixed(1)}s`
            if (runTimeMed < 330.0) medString += `&a${formattedRuntime}`;
            else if (runTimeMed < 360.0) medString += `&e${formattedRuntime}`;
            else medString += `&c${formattedRuntime}`;
            medString += " &7| &r";
        }


        if (medString != "&9AVGs &7>> ") {
            ChatLib.chat(medString);
        }

        if (this.playerData.PRE4RATEN != 0) {
            ChatLib.chat(`&9pre4 &7>> &f${this.playerData.PRE4RATE}/${this.playerData.PRE4RATEN} (${((this.playerData.PRE4RATE / this.playerData.PRE4RATEN) * 100).toFixed(1)}%)`);
        }
    }

    // for tracking things that were added after v0.0.1
    playerDataCheck() {
        if (!this.playerData?.["SSTRACKING"]) {
            this.playerData.SSTRACKING = [];
        }
        if (!this.playerData?.["TERMSTRACKING"]?.length) {
            this.playerData.TERMSTRACKING = [];
        }
        if (!this.playerData?.["CAMPSTRACKING"]?.length) {
            this.playerData.CAMPSTRACKING = [];
        }
        if (!this.playerData?.["BRTRACKING"]?.length) {
            this.playerData.BRTRACKING  = [];
        }
        if (!this.playerData?.["RUNTIMETRACKING"]?.length) {
            this.playerData.RUNTIMETRACKING = [];
        }

        this.save();
    }

    updateMovingAVG(TYPE, TYPEN, TIME, INCREMENT=true) {
        this.playerData[TYPEN] += 1;
        let newAvg = (this.playerData[TYPE] * (this.playerData[TYPEN] - 1) / this.playerData[TYPEN] + (TIME / this.playerData[TYPEN])).toFixed(2);
        console.log(`${TYPE}: ${TIME}`);
        this.playerData[TYPE] = parseFloat(newAvg);
        this.save();

        if (!INCREMENT) {
            this.playerData[TYPEN] -= 1;
            this.save();
        }

        switch (TYPE) {
            case "AVGSSTIME": {
                this.addTime("SSTRACKING", TIME);
                if (TIME < this.playerData.SSPB) {
                    this.playerData.SSPB = TIME;
                    this.save();
                }
                break;
            }
            case "AVGRUNTIME": {
                this.playerData.LASTSESSION = Date.now();
                this.addTime("RUNTIMETRACKING", TIME);
                if (TIME < this.playerData.RUNPB) {
                    this.playerData.RUNPB = TIME;
                    this.save();
                }
                break;
            }
            case "AVGCAMP": {
                this.addTime("CAMPSTRACKING", TIME);
                if (TIME < this.playerData.CAMPPB) {
                    this.playerData.CAMPPB = TIME;
                    this.save();
                }
                break;
            }
            case "AVGTERMS": {
                this.addTime("TERMSTRACKING", TIME);
                if (TIME < this.playerData.TERMSPB) {
                    this.playerData.TERMSPB = TIME;
                    this.save();
                }
                break;
            }
            case "AVGBR": {
                this.addTime("BRTRACKING", TIME);
                break;
            }
        }
    }

    dodge(length, note="") {
        if (this.playerData.DODGE) {
            this.playerData.DODGE = false;
            this.playerData.DODGELENGTH = 0;
            this.playerData.DODGEDATE = 0;
            this.save();
            ChatLib.chat(`&9Dodge Removed &7>> &f${this.playerData.USERNAME}`);
            return;
        }

        let dodgeStr = `&8Now Dodging &7>> &f${this.playerData.USERNAME}`

        if (!length || length === undefined) {
            length = 0;
        } else {
            dodgeStr += `\n&8Days &7>> &f${length}`;
        }

        if (!note || note == undefined) {
            note = "";
        } else if (note != "") {
            dodgeStr += `\n&8Note &7>> &f${note}`;
        }

        if (note != "") {
            this.playerData.NOTE = note;
        }

        if (length != 0) {
            this.playerData.DODGELENGTH = length;
            this.playerData.DODGEDATE = Date.now();
        }

        this.playerData.DODGE = true;
        this.save();

        ChatLib.chat(dodgeStr);
    }

    check(autokick=false, sayReason=false) {
        this.printPlayer();
        if(this.playerData.DODGE) {
            World.playSound("mob.horse.donkey.idle", 1, 1);
            let dodgeStr = "";
            // ChatLib.chat(`${this.playerData.USERNAME} is dodged.`);
            
            if (this.playerData.DODGELENGTH != 0) {
                let timeLeft = Date.now() - this.playerData.DODGEDATE;
                timeLeft /= 1000; // seconds
                timeLeft /= 60; // minutes
                timeLeft /= 60; // hours
                timeLeft /= 24; // days
                timeLeft = parseFloat( (this.playerData.DODGELENGTH - timeLeft).toFixed(1) );
                if (timeLeft > 0) {
                    dodgeStr = `: (dodged: ${timeLeft} days remaining)`;
                } else {
                    dodgeStr = ` was dodged for ${this.DODGELENGTH} days. removing dodge.`;
                    this.playerData.DODGE = false;
                    this.playerData.DODGELENGTH = 0;
                    this.playerData.DODGEDATE = 0;
                    this.save();
                }
            } else {
                dodgeStr = ": (dodged)";
            }

            if (this.playerData.NOTE != "") {
                dodgeStr += ` : ${this.playerData.NOTE}`;
            }


            ChatLib.chat(`${this.playerData.USERNAME}${dodgeStr}`);
            
            if(this.playerData.DODGE && autokick) {
                if (sayReason) {
                    ChatLib.command(`pc ${this.playerData.USERNAME}${dodgeStr}`);
                }

                setTimeout( () => {
                    ChatLib.command(`p kick ${this.playerData.USERNAME}`);
                }, 500);
            }
        }
    }

    addTime(TYPE, TIME) {
        if (!this.playerData?.[TYPE]?.length) {
            this.playerData[TYPE] = [];
        }

        this.playerData[TYPE].push(TIME);

        if (this.playerData[TYPE].length > 30) {
            this.playerData[TYPE].shift();
        }

        this.save();
    }

    getMedian(TYPE) {
        if (!this.playerData?.[TYPE]?.length) {
            this.playerData[TYPE] = [];
            this.save();
            return 0.0;
        }

        let temparr = this.playerData[TYPE].map( (x) => x);
        temparr = temparr.sort((a, b) => a - b);

        let half = Math.floor(temparr.length / 2);

        let val = (temparr.length % 2 ? temparr[half] : (temparr[half - 1] + temparr[half]) / 2);
        return val.toFixed(2);
    }
}
