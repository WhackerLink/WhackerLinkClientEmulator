/*
    Caleb, KO4UYJ
    discord: _php_
    email: ko4uyj@gmail.com
*/

import io from "socket.io-client";
import logger from "./logger.js";
import readline from "readline";
import fs from "fs";
import yaml from "js-yaml";

console.log(`
    WhackerLink Client Emulator
    Caleb, KO4UYJ

    Commands:
        ctrL + c : quit
        k : key
        u : unkey

    Params:
        -c config.example.yml
`);

const configFilePathIndex = process.argv.indexOf('-c');
if (configFilePathIndex === -1 || process.argv.length <= configFilePathIndex + 1) {
    logger.error("Please provide the path to the configuration file using -c arg");
    process.exit(1);
}

const configFilePath = process.argv[configFilePathIndex + 1];


const configFile = fs.readFileSync(configFilePath, 'utf8');
const config = yaml.load(configFile);


const peerSocket = io(config.networkUrl, {
    query: { token: config.networkJWT }
});

if (!config.bgMode){

    readline.emitKeypressEvents(process.stdin);

    process.stdin.on('keypress', (ch, key) => {
        //console.log('got keypress', ch, key);
        if (key && key.ctrl && key.name == 'c') {
            process.exit();
        } else if(key && key.name == 'k') {
            request_voice_channel();
        } else if(key && key.name == 'u') {
            release_voice_channel();
        }
    });

    process.stdin.setRawMode(true);
}

const userStatus = {
    microphone: true,
    mute: false,
    srcId: config.srcId,
    online: true,
    dstId: config.dstId,
    controlChannel: config.controlChannel,
    voiceChannel: "000.0000"
};

let denied = false;
let connected = false;

let occasionalKey = true;

peerSocket.on('connect', function(d){
    logger.info("Connected to network");
    emulatePowerOn();
    connected = true;
});

peerSocket.on("CONTROL_CHANNEL_ERROR", function(data) {
    logger.error(data.message);
});

function emulatePowerOn(){
     peerSocket.emit("JOIN_CONTROL_CHANNEL", {channel: userStatus.controlChannel});
     updateStatus(userStatus);
     peerSocket.emit("REG_REQUEST", userStatus.srcId);
     logger.info("Reg Request");

     peerSocket.once("REG_GRANTED", (data)=>{
         logger.info("Reg Granted")
         startAffiliation();
     });

     peerSocket.once("REG_REFUSE", (data)=>{
         logger.warn("Sys reg refuse");
     });
}

function startAffiliation(srcId, dstId){
    logger.info("Affiliation Request")
    peerSocket.emit('CHANNEL_AFFILIATION_REQUEST', {"srcId": userStatus.srcId, "dstId": userStatus.dstId});
    peerSocket.on("CHANNEL_AFFILIATION_GRANTED", function (data){
        if (data.srcId === userStatus.srcId){
            logger.info("Affiliation granted");
            peerSocket.off("CHANNEL_AFFILIATION_GRANTED");
        }
    });

        peerSocket.on("VOICE_CHANNEL_GRANT", function (data) {
            if (data.srcId === userStatus.srcId && data.dstId === userStatus.dstId) {
                userStatus.microphone = !userStatus.microphone;
                logger.info("Switching to voice channel: " + data.newChannel);
                userStatus.voiceChannel = data.newChannel;
                updateStatus();
                peerSocket.emit("VOICE_CHANNEL_CONFIRMED", {"srcId": userStatus.srcId, "dstId": userStatus.dstId});
                logger.info(userStatus.voiceChannel);
                denied = false;
            } else if(data.dstId === userStatus.dstId) {
                logger.info("Switching to voice channel: " + data.newChannel);
                userStatus.voiceChannel = data.newChannel;
                updateStatus(userStatus);
                peerSocket.emit("VOICE_CHANNEL_CONFIRMED", {"srcId": userStatus.srcId, "dstId": userStatus.dstId});
            }
        });
        peerSocket.on("VOICE_CHANNEL_RELEASE", function (data){
            if (data.srcId === userStatus.srcId && data.dstId === userStatus.dstId) {
                logger.info("Released Voice Channel");
                userStatus.microphone = !userStatus.microphone;
                userStatus.voiceChannel = "000.0000";
                updateStatus(userStatus);
                denied = false;
            } else if(data.dstId === userStatus.dstId){
                logger.info("Got voice release");
                userStatus.voiceChannel = "000.0000";
                updateStatus(userStatus);
            }
        });
        peerSocket.on("VOICE_CHANNEL_DENY", function (data){
            denied = true
            if (data.srcId === userStatus.srcId && data.dstId === userStatus.dstId) {
                 logger.info("Voice Channel Deny");
                 denied = false;
            }
        });

}

function request_voice_channel() {
    peerSocket.emit("VOICE_CHANNEL_REQUEST", {"srcId": userStatus.srcId, "dstId": userStatus.dstId});
}

function release_voice_channel() {
    if (!denied) {
        logger.info("Send voice channel release");
        peerSocket.emit("RELEASE_VOICE_CHANNEL", {"srcId": userStatus.srcId, "dstId": userStatus.dstId});
    } else {
        denied = false
    }
}

function updateStatus(status){
     peerSocket.emit("userInformation", userStatus);
}



if (config.occasionalVoiceTransmission){
    setInterval(()=>{
        if (connected){
            request_voice_channel();
             setTimeout(()=>{
                release_voice_channel();
            }, config.occasionalTransmissionsLength);
        }
   }, config.occasionalTransmissionsOccurance);
}

peerSocket.on("updateChannels", (data)=>{
    //
});
