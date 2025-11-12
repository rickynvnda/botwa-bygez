import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import path from 'path';

// --- KONFIGURASI BOT ---
const SESSION_PATH = path.join(process.cwd(), 'whatsapp_session');
const PREFIX = '.'; // Prefix perintah

// ⚠️ GANTI INI: Gunakan Array untuk mendaftarkan semua ID Pemilik Bot.
// Format: 'NomorTelepon@c.us' (Contoh: '6281234567890@c.us')
const OWNER_IDS = [
    '6281227701623@c.us', 
    '628980296227@c.us'  
    // Tambahkan ID lain di sini jika ada
]; 

// Objek untuk menyimpan status fitur per chat/grup (status akan hilang jika bot restart)
const featureStatus = {}; 

// Fungsi untuk mendapatkan status atau inisialisasi status default
function getChatStatus(chatId) {
    if (!featureStatus[chatId]) {
        featureStatus[chatId] = {
            antisharelink: false,
            antilongtext: false,
        };
    }
    return featureStatus[chatId];
}

// Inisialisasi Klien WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "whatsapp_bot_session", dataPath: SESSION_PATH }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox' // Penting untuk VPS
        ]
    }
});

client.on('qr', (qr) => {
    console.log('--- SCAN QR CODE INI ---');
    qrcode.generate(qr, { small: true });
    console.log('--- SCAN QR CODE INI ---');
});

client.on('ready', () => {
    console.log('✅ Klien siap dan terhubung!');
});

client.on('disconnected', (reason) => {
    console.log('❌ Klien terputus:', reason);
});

// Event saat ada pesan masuk
client.on('message', async msg => {
    const chat = await msg.getChat();
    const chatStatus = getChatStatus(chat.id._serialized);
    const chatText = msg.body || ''; 

    // ID pengirim pesan
    const remoteJid = msg.from; 
    
    // 1. --- LOGIKA ANTI-FITUR ---

    // A. Anti Share Link
    if (chatStatus.antisharelink) {
        const urlRegex = /(https?:\/\/[^\s]+|wa\.me\/\d+)/i;
        if (urlRegex.test(chatText)) {
            console.log(`[ANTI-LINK] Link terdeteksi di chat ${chat.id._serialized}`);
            await msg.delete(true); 
            client.sendMessage(chat.id._serialized, '⚠️ Peringatan: Berbagi link dilarang di grup ini!');
            return;
        }
    }

    // B. Anti Long Text
    const MAX_LENGTH = 500; 
    if (chatStatus.antilongtext && chatText.length > MAX_LENGTH) {
        console.log(`[ANTI-LONGTEXT] Teks panjang (${chatText.length}) terdeteksi.`);
        await msg.delete(true);
        client.sendMessage(chat.id._serialized, `⚠️ Peringatan: Pesan terlalu panjang (${chatText.length} karakter). Batasnya adalah ${MAX_LENGTH} karakter.`);
        return;
    }
    
    // --- PENANGANAN PERINTAH (COMMAND) ---
    if (!chatText.startsWith(PREFIX)) return; 

    const args = chatText.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Untuk perintah admin, cek apakah pengirim adalah admin grup
    const isAdmin = chat.isGroup && (await chat.getParticipantIds()).find(p => p.id._serialized === remoteJid && p.isAdmin);
    
    // Cek apakah pengirim adalah salah satu OWNER BOT
    const isOwner = OWNER_IDS.includes(remoteJid); 


    switch (command) {
        
        // --- ADMIN COMMANDS ---

        case 'antisharelink':
            if (!chat.isGroup) return msg.reply('Perintah ini hanya bisa digunakan di Grup.');
            if (!isAdmin) return msg.reply('Anda bukan Admin Grup.');
            
            const linkAction = args[0]?.toLowerCase();
            if (linkAction === 'on') {
                chatStatus.antisharelink = true;
                msg.reply('Fitur **Anti Share Link** telah diaktifkan di grup ini.');
            } else if (linkAction === 'off') {
                chatStatus.antisharelink = false;
                msg.reply('Fitur **Anti Share Link** telah dinonaktifkan.');
            } else {
                msg.reply(`Status Anti Share Link: **${chatStatus.antisharelink ? 'ON' : 'OFF'}**\n\nGunakan: ${PREFIX}antisharelink on/off`);
            }
            break;

        case 'antilongtext':
            if (!chat.isGroup) return msg.reply('Perintah ini hanya bisa digunakan di Grup.');
            if (!isAdmin) return msg.reply('Anda bukan Admin Grup.');
            
            const textAction = args[0]?.toLowerCase();
            if (textAction === 'on') {
                chatStatus.antilongtext = true;
                msg.reply('Fitur **Anti Long Text** (Batas: 500 karakter) telah diaktifkan.');
            } else if (textAction === 'off') {
                chatStatus.antilongtext = false;
                msg.reply('Fitur **Anti Long Text** telah dinonaktifkan.');
            } else {
                msg.reply(`Status Anti Long Text: **${chatStatus.antilongtext ? 'ON' : 'OFF'}**\n\nGunakan: ${PREFIX}antilongtext on/off`);
            }
            break;

        case 'kick':
            if (!chat.isGroup) return msg.reply('Perintah ini hanya bisa digunakan di Grup.');
            if (!isAdmin) return msg.reply('Anda bukan Admin Grup.');
            
            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                const targetId = quotedMsg.author || quotedMsg.from; 
                
                try {
                    await chat.removeParticipants([targetId]);
                    msg.reply(`✅ Pengguna @${targetId.split('@')[0]} telah dikeluarkan dari grup.`, null, { mentions: [targetId] });
                } catch (error) {
                    msg.reply('❌ Gagal mengeluarkan pengguna. Pastikan bot adalah Admin dan memiliki hak untuk meng-kick.');
                }
            } else if (msg.mentionedIds.length > 0) {
                 try {
                    await chat.removeParticipants(msg.mentionedIds);
                    msg.reply(`✅ Pengguna yang di-tag telah dikeluarkan dari grup.`);
                } catch (error) {
                    msg.reply('❌ Gagal mengeluarkan pengguna yang di-tag. Pastikan bot adalah Admin dan memiliki hak untuk meng-kick.');
                }
            } else {
                msg.reply(`Gunakan ${PREFIX}kick dengan me-reply pesan target atau tag pengguna.`);
            }
            break;

        // --- OWNER COMMANDS ---

        case 'broadcast':
            if (!isOwner) return msg.reply('❌ Perintah ini hanya bisa digunakan oleh Pemilik Bot.');
            
            const textToBroadcast = args.join(' ');
            if (!textToBroadcast) return msg.reply(`Gunakan: ${PREFIX}broadcast [teks broadcast]`);

            const allChats = await client.getChats();
            let broadcastCount = 0;

            await msg.reply('⏳ Memulai broadcast. Harap tunggu...');

            for (const chatItem of allChats) {
                if (chatItem.isGroup) {
                    try {
                        await client.sendMessage(chatItem.id._serialized, `**Pesan Broadcast dari Owner:**\n\n${textToBroadcast}`);
                        broadcastCount++;
                    } catch (error) {
                        console.error(`Gagal mengirim broadcast ke grup ${chatItem.name}:`, error);
                    }
                }
            }

            msg.reply(`✅ Pesan broadcast berhasil dikirim ke **${broadcastCount}** Grup.`);
            break;

        // --- GENERAL COMMANDS ---
        
        case 'ping':
            msg.reply('Pong!');
            break;

        case 'help':
            msg.reply(`**🤖 Fitur Bot**\n\n*General:*\n${PREFIX}ping - Tes koneksi.\n\n*Admin Grup (Perlu Bot Admin):*\n${PREFIX}antisharelink on/off - Cegah pengiriman link.\n${PREFIX}antilongtext on/off - Cegah teks terlalu panjang (>1000 kar).\n${PREFIX}kick - Reply/tag pengguna untuk dikeluarkan.\n\n*Owner Bot (Hanya Anda):*\n${PREFIX}broadcast [teks] - Kirim pesan ke SEMUA Grup.`);
            break;
            
        default:
            break;
    }
});

client.initialize();