// CÓDIGO FINAL CON LOGGER TOTAL + ANTI-LINK + WELCOME + MUTE + DETECTOR ADMIN - index.js

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    isJidBroadcast,
    isJidStatusBroadcast,
    isJidNewsletter,
} = require('baileys');

const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const readline = require('readline');
const NodeCache = require('node-cache');
const mostrarBanner = require('./banner');

// LOGGER
const { logCommand, logMessage } = require('./logger.js');

const prefix = '.';

// =============== BASE ANTI-LINK =================
const antilinkDB = path.join(__dirname, 'antilink-db.json');
if (!fs.existsSync(antilinkDB)) {
    fs.writeFileSync(antilinkDB, JSON.stringify({}));
}

// =============== BASE WELCOME =================
const welcomeDB = path.join(__dirname, 'welcome-db.json');
if (!fs.existsSync(welcomeDB)) {
    fs.writeFileSync(welcomeDB, JSON.stringify({}));
}

// =============== BASE MUTE =================
const muteDB = path.join(__dirname, 'mute-db.json');
if (!fs.existsSync(muteDB)) {
    fs.writeFileSync(muteDB, JSON.stringify({}));
}

// =============== BASE DETECTOR ADMIN (NUEVO) =================
const detectDB = path.join(__dirname, 'detect-db.json');
if (!fs.existsSync(detectDB)) {
    fs.writeFileSync(detectDB, JSON.stringify({}));
}
// =============================================================

// --- CARGA DE COMANDOS ---
const commands = new Map();
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(path.join(__dirname, 'commands', file));
    commands.set(command.name, command);
    if (command.aliases && command.aliases.length > 0) {
        for (const alias of command.aliases) {
            commands.set(alias, command);
        }
    }
}
console.log('Comandos y aliases cargados exitosamente.');

const msgRetryCounterCache = new NodeCache();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function connectToWhatsApp() {

    mostrarBanner();
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const version = [2, 3000, 1029399661];
    console.log(`Usando la versión de WA: ${version.join('.')}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        shouldIgnoreJid: (jid) => isJidBroadcast(jid) || isJidStatusBroadcast(jid) || isJidNewsletter(jid),
        connectTimeoutMs: 20_000,
        keepAliveIntervalMs: 30_000,
        maxMsgRetryCount: 3,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        emitOwnEvents: false,
        msgRetryCounterCache,
    });

    if (!sock.authState.creds.registered) {
        console.log('Credenciales no encontradas. Vinculando dispositivo...');
        const phoneNumber = await question('Ingresa tu número con código de país (ej: 51987654321): ');

        try {
            const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
            console.log(`TU CÓDIGO DE VINCULACIÓN ES: ${code}`);
        } catch (error) {
            console.error('Error al solicitar el código.', error);
            connectToWhatsApp();
        }
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect =
                (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

            console.log('Conexión cerrada. ¿Reconectando?:', shouldReconnect);

            if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);

        } else if (connection === 'open') {
            console.log('¡Bot conectado correctamente!');
        }
    });

    sock.ev.on('creds.update', saveCreds);


    // =====================================================  
    //                MANEJO DE MENSAJES  
    // =====================================================  

    sock.ev.on('messages.upsert', async m => {

        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;

        const messageText =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        // =====================================================  
        //               🔥 SISTEMA ANTI-LINK 🔥  
        // =====================================================  

        try {
            if (from.endsWith("@g.us")) {

                const db = JSON.parse(fs.readFileSync(antilinkDB));

                if (db[from]) {

                    const metadata = await sock.groupMetadata(from);
                    const participants = metadata.participants;

                    const botId = sock.user.id.split(":")[0] + "@s.whatsapp.net";
                    const botIsAdmin = participants.find(p => p.id === botId)?.admin !== null;

                    if (!botIsAdmin) return;

                    const sender = msg.key.participant;
                    const senderIsAdmin = participants.find(p => p.id === sender)?.admin !== null;

                    const regex = /(https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+)/gi;
                    const found = messageText.match(regex);

                    if (found) {

                        const invite = await sock.groupInviteCode(from);
                        const realGroupLink = `https://chat.whatsapp.com/${invite}`;

                        if (found.includes(realGroupLink)) return;

                        if (senderIsAdmin) {
                            return sock.sendMessage(from, {
                                text: `⚠️ Un administrador compartió un enlace externo (permitido).`
                            });
                        }

                        await sock.sendMessage(from, { delete: msg.key });

                        await sock.sendMessage(from, {
                            text: `🚫 *Link externo detectado*\nEl usuario *@${sender.split("@")[0]}* fue expulsado.`,
                            mentions: [sender]
                        });

                        await sock.groupParticipantsUpdate(from, [sender], "remove");
                    }
                }
            }
        } catch (e) {
            console.error("Error AntiLink:", e);
        }

        // =====================================================
        //                🔇 SISTEMA AUTO-MUTE (MEJORADO)
        // =====================================================

        try {
            if (from.endsWith("@g.us")) {

                const db = JSON.parse(fs.readFileSync(muteDB));
                const sender = msg.key.participant;

                if (!db[from]) db[from] = {};

                if (db[from][sender]?.muted) {

                    // ELIMINAR MENSAJE
                    await sock.sendMessage(from, { delete: msg.key });

                    // SUMAR STRIKE
                    db[from][sender].strikes = (db[from][sender].strikes || 0) + 1;

                    // ADVERTENCIA AL QUINTO
                    if (db[from][sender].strikes === 5 && !db[from][sender].warned) {

                        db[from][sender].warned = true;

                        await sock.sendMessage(from, {
                            text: `⚠️ *Advertencia @${sender.split("@")[0]}*\n\n` +
                                `Llevas *5 mensajes eliminados* mientras estás muteado.\n` +
                                `Si envías *2 mensajes más*, serás *expulsado*.`,
                            mentions: [sender]
                        });
                    }

                    // EXPULSIÓN AL STRIKE 7
                    if (db[from][sender].warned && db[from][sender].strikes >= 7) {

                        await sock.sendMessage(from, {
                            text: `🚫 *@${sender.split("@")[0]}* fue expulsado por ignorar el mute.`,
                            mentions: [sender]
                        });

                        try {
                            await sock.groupParticipantsUpdate(from, [sender], "remove");
                        } catch (e) { }

                        db[from][sender] = {
                            muted: false,
                            strikes: 0,
                            warned: false
                        };
                    }

                    fs.writeFileSync(muteDB, JSON.stringify(db, null, 2));

                    return;
                }
            }
        } catch (err) {
            console.error("Error en sistema MUTE:", err);
        }

        // =====================================================  
        //        SISTEMA DE COMANDOS + LOGGER  
        // =====================================================  

        if (messageText.startsWith(prefix)) {

            const args = messageText.slice(prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            const command = commands.get(commandName);

            if (command) {
                try {
                    await logCommand(sock, msg, commandName, prefix);
                    await command.execute(sock, msg, args);
                } catch (error) {
                    console.error("Error ejecutando comando:", error);
                }
            }

        } else if (messageText) {
            await logMessage(sock, msg);
        }

    });

    // =====================================================
    //          SISTEMA WELCOME + GOODBYE + DETECTOR
    // =====================================================
    sock.ev.on('group-participants.update', async update => {
        try {
            const groupId = update.id;
            const metadata = await sock.groupMetadata(groupId);
            const participants = update.participants;

            // 1. LÓGICA DE WELCOME / BYE
            const dbWelcome = JSON.parse(fs.readFileSync(welcomeDB));
            if (dbWelcome[groupId]) {
                for (let user of participants) {
                    let ppUrl;
                    try {
                        ppUrl = await sock.profilePictureUrl(user, 'image');
                    } catch {
                        ppUrl = "https://i.imgur.com/4Qy5FjT.jpeg";
                    }

                    let tagUser = "@" + user.split("@")[0];

                    if (update.action === "add") {
                        let texto = `╭━━ ⪩ 𝑺𝒆𝒂 𝒃𝒊𝒆𝒏𝒗𝒆𝒏𝒊𝒅𝒐 ⪨━━╮\n\n┊🌸 Hola ${tagUser}\n┊🈯 Te damos la bienvenida a:\n┊📛 ${metadata.subject}\n┊📅 Fecha: ${new Date().toLocaleString()}\n╰━━━━━━━━━━━━━━━━━━╯\n© ⍴᥆ᥕᥱrᥱძ ᑲᥡ ᗪ卂尺Ҝ`;
                        await sock.sendMessage(groupId, { image: { url: ppUrl }, caption: texto, mentions: [user] });
                    } else if (update.action === "remove") {
                        let texto = `╭━━ ⪩ 𝑨𝒕𝒆 𝒍𝒖𝒆𝒈𝒐 ⪨━━╮\n\n┊💫 Adiós ${tagUser}\n┊🈯 Ha salido de:\n┊📛 ${metadata.subject}\n┊📅 Fecha: ${new Date().toLocaleString()}\n╰━━━━━━━━━━━━━━━━━━╯\n© ⍴᥆ᥕᥱrᥱძ ᑲᥡ ᗪ卂尺Ҝ`;
                        await sock.sendMessage(groupId, { image: { url: ppUrl }, caption: texto, mentions: [user] });
                    }
                }
            }

            // 2. LÓGICA DEL DETECTOR DE ADMIN (Promote/Demote)
            const dbDetect = JSON.parse(fs.readFileSync(detectDB));
            
            // Solo ejecuta si la función está activa en el grupo y es promote o demote
            if (dbDetect[groupId] && (update.action === "promote" || update.action === "demote")) {
                
                // Quién realizó la acción (el admin supremo)
                const actor = update.author || update.actor; 
                // A quién se la hicieron (pueden ser varios)
                
                for (const user of participants) {
                    let text = "";
                    if (update.action === "promote") {
                        text = `👮‍♂️ *DETECTOR DE ADMIN* 👮‍♂️\n\n` +
                               `🎉 *@${user.split("@")[0]}* ha sido ascendido a *ADMIN*.\n` +
                               `👑 *Promovido por:* @${actor.split("@")[0]}`;
                    } else if (update.action === "demote") {
                        text = `👮‍♂️ *DETECTOR DE ADMIN* 👮‍♂️\n\n` +
                               `📉 *@${user.split("@")[0]}* ha sido degradado a *MIEMBRO*.\n` +
                               `🔨 *Degradado por:* @${actor.split("@")[0]}`;
                    }

                    await sock.sendMessage(groupId, {
                        text: text,
                        mentions: [user, actor]
                    });
                }
            }

        } catch (e) {
            console.error("Error en update de participantes:", e);
        }
    });

}

connectToWhatsApp();