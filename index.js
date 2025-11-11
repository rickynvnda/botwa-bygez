const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { isJidGroup } = require('@whiskeysockets/baileys');
const fs = require('fs');

// Tambahkan qrcode-terminal agar QR code tetap bisa muncul di terminal
const qrcode = require('qrcode-terminal');

const LINK_REGEX = /(https?:\/\/[^\s]+)/gi;
const MAX_TEXT_LENGTH = 400;

let groupSettings = {};
const SETTINGS_FILE = 'groupSettings.json';
if (fs.existsSync(SETTINGS_FILE)) {
    groupSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
}

function saveSettings() {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(groupSettings, null, 2));
}

function getGroupSetting(jid) {
    if (!groupSettings[jid]) {
        groupSettings[jid] = {
            antisharelink: false,
            antilongtext: false
        };
    }
    return groupSettings[jid];
}

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({
        auth: state
        // printQRInTerminal sudah deprecated, gunakan handler di bawah
    });

    sock.ev.on('creds.update', saveCreds);

    // Handler QR agar tetap muncul di terminal
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            if ((lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                startSock();
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (let msg of messages) {
            if (!msg.message || !msg.key.remoteJid) continue;
            const jid = msg.key.remoteJid;
            const fromMe = msg.key.fromMe;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (!text || !isJidGroup(jid)) continue;

            // Command handler
            if (text.startsWith('.antisharelink ')) {
                const value = text.split(' ')[1]?.toLowerCase();
                if (value === 'on' || value === 'off') {
                    getGroupSetting(jid).antisharelink = value === 'on';
                    saveSettings();
                    await sock.sendMessage(jid, { text: `Fitur antisharelink ${value === 'on' ? 'diaktifkan' : 'dinonaktifkan'}.` }, { quoted: msg });
                }
                continue;
            }
            if (text.startsWith('.antilongtext ')) {
                const value = text.split(' ')[1]?.toLowerCase();
                if (value === 'on' || value === 'off') {
                    getGroupSetting(jid).antilongtext = value === 'on';
                    saveSettings();
                    await sock.sendMessage(jid, { text: `Fitur antilongtext ${value === 'on' ? 'diaktifkan' : 'dinonaktifkan'}.` }, { quoted: msg });
                }
                continue;
            }

            // Feature handler
            const setting = getGroupSetting(jid);

            // Antisharelink
            if (!fromMe && setting.antisharelink && LINK_REGEX.test(text)) {
                await sock.sendMessage(jid, { text: '⚠️ Sorry, Share link tidak diizinkan di grup ini. ~Gez.' }, { quoted: msg });
                await sock.sendMessage(jid, { delete: msg.key });
                continue;
            }

            // Antilongtext
            if (!fromMe && setting.antilongtext && text.length > MAX_TEXT_LENGTH) {
                await sock.sendMessage(jid, { text: '⚠️ Sorry, Pesan terlalu panjang dan dianggap spam. ~Gez.' }, { quoted: msg });
                await sock.sendMessage(jid, { delete: msg.key });
                continue;
            }

            // Sharetext command (admin only)
            if (text.startsWith('!sharetext ')) {
                const shareMsg = text.replace('!sharetext ', '');
                const groups = await sock.groupFetchAllParticipating();
                for (let groupJid in groups) {
                    await sock.sendMessage(groupJid, { text: shareMsg });
                }
                await sock.sendMessage(jid, { text: '✅ Done, Pesan berhasil dikirim ke semua grup. ~Gez.' }, { quoted: msg });
            }
        }
    });
}

startSock();
