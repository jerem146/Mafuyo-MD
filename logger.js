// Archivo: logger.js (Actualizado para todo tipo de mensajes)

const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
};

// --- FUNCIÓN PARA LOGUEAR COMANDOS ---
async function logCommand(sock, m, commandName, prefix) {
    const from = m.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = m.key.participant || from;
    const userName = m.pushName || "Nombre no disponible";

    const dateTime = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    let chatName = 'Chat Privado';
    if (isGroup) {
        try {
            const metadata = await sock.groupMetadata(from);
            chatName = metadata.subject;
        } catch (e) { chatName = 'Grupo Desconocido'; }
    }

    const banner = `
${colors.green}╔══════════════════════════════════╗
${colors.green}║        ${colors.yellow}⚡ NUEVO COMANDO EJECUTADO ⚡${colors.green}       ║
${colors.green}╠══════════════════════════════════╣
${colors.green}║ ${colors.cyan}👤 Usuario:${colors.reset} ${userName}
${colors.green}║ ${colors.cyan}   ↳ Número:${colors.reset} ${sender.split('@')[0]}
${colors.green}║ ${colors.magenta}📍 Chat:${colors.reset} ${chatName}
${colors.green}║ ${colors.blue}💬 Comando:${colors.reset} ${prefix}${commandName}
${colors.green}║ ${colors.yellow}🕒 Fecha y Hora:${colors.reset} ${dateTime}
${colors.green}╚══════════════════════════════════╝
    `;
    console.log(banner);
}

// --- NUEVA FUNCIÓN PARA LOGUEAR MENSAJES NORMALES ---
async function logMessage(sock, m) {
    const from = m.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = m.key.participant || from;
    const userName = m.pushName || "Nombre no disponible";
    const messageText = m.message.conversation || m.message.extendedTextMessage?.text || "";

    // Truncamos el mensaje si es muy largo para no romper la consola
    const shortMessage = messageText.substring(0, 40) + (messageText.length > 40 ? '...' : '');

    const dateTime = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    let chatName = 'Chat Privado';
    if (isGroup) {
        try {
            const metadata = await sock.groupMetadata(from);
            chatName = metadata.subject;
        } catch (e) { chatName = 'Grupo Desconocido'; }
    }

    const banner = `
${colors.blue}╔══════════════════════════════════╗
${colors.blue}║         ${colors.cyan}📥 MENSAJE RECIBIDO 📥${colors.blue}          ║
${colors.blue}╠══════════════════════════════════╣
${colors.blue}║ ${colors.cyan}👤 Usuario:${colors.reset} ${userName}
${colors.blue}║ ${colors.magenta}📍 Chat:${colors.reset} ${chatName}
${colors.blue}║ ${colors.yellow}📄 Mensaje:${colors.reset} "${shortMessage}"
${colors.blue}╚══════════════════════════════════╝
    `;
    console.log(banner);
}

// Exportamos ambas funciones
module.exports = { logCommand, logMessage };