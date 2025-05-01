const { Client, GatewayIntentBits, SlashCommandBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const mongoose = require('mongoose');
require('dotenv').config();

// Ortam değişkenleri
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const ALLOWED_ROLE_ID = process.env.ALLOWED_ROLE_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BACKUP_CHANNEL_ID = process.env.BACKUP_CHANNEL_ID;
const BACKUP_USER_ID = process.env.BACKUP_USER_ID;
const MONGODB_URI = process.env.MONGODB_URI;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('vouch')
        .setDescription('Bir değerlendirme gönderin.')
        .addStringOption(option => 
            option.setName('stars')
                .setDescription('Değerlendirme yıldızları (1-5 arası)')
                .setRequired(true)
                .addChoices(
                    { name: '⭐', value: '1' },
                    { name: '⭐⭐', value: '2' },
                    { name: '⭐⭐⭐', value: '3' },
                    { name: '⭐⭐⭐⭐', value: '4' },
                    { name: '⭐⭐⭐⭐⭐', value: '5' }
                ))
        .addStringOption(option => 
            option.setName('message')
                .setDescription('Değerlendirme mesajınız')
                .setRequired(true))
        .addAttachmentOption(option => 
            option.setName('image')
                .setDescription('Değerlendirme için bir görsel (isteğe bağlı)')),
    new SlashCommandBuilder()
        .setName('voucherbackup')
        .setDescription('Tüm değerlendirmeleri yedek kanala geri yükleyin.')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('Komutlar kaydediliyor...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );
        console.log('Komutlar başarıyla kaydedildi!');
    } catch (error) {
        console.error(error);
    }
})();

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB Atlas bağlantısı başarılı!');
}).catch(err => {
    console.error('MongoDB bağlantı hatası:', err);
});

const voucherSchema = new mongoose.Schema({
    stars: Number,
    message: String,
    image: String,
    user: String,
    date: String,
    time: String,
});

const Voucher = mongoose.model('Voucher', voucherSchema);

async function saveVoucherData(voucherData) {
    const voucher = new Voucher(voucherData);
    await voucher.save();
    console.log('Değerlendirme MongoDB\'ye kaydedildi:', voucher);
}

async function getVoucherData() {
    return await Voucher.find();
}

client.once('ready', () => {
    console.log(`${client.user.tag} giriş yaptı!`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, user } = interaction;

    if (commandName === 'vouch') {
        if (!member.roles.cache.has(ALLOWED_ROLE_ID)) {
            await interaction.reply({ content: '🚫 Bu komutu kullanma yetkiniz yok.', ephemeral: true });
            return;
        }

        const stars = parseInt(options.getString('stars'));
        const message = options.getString('message');
        const image = options.getAttachment('image');
        const now = new Date();
        const formattedDate = now.toLocaleDateString();
        const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const voucherData = {
            stars,
            message,
            image: image?.url ?? null,
            user: interaction.user.username,
            date: formattedDate,
            time: formattedTime,
        };

        await saveVoucherData(voucherData);

        const embed = {
            color: 0x4CAF50,
            title: '✨ Yeni Değerlendirme',
            description: `📝 **Mesaj:**\n>>> ${message}\n`,
            fields: [
                { name: '⭐ **Beğeni:**', value: '⭐'.repeat(stars), inline: false },
                { name: '👤 **Kullanıcı:**', value: `@${interaction.user.username}`, inline: true },
                { name: '📅 **Tarih:**', value: formattedDate, inline: true },
                { name: '⏰ **Saat:**', value: formattedTime, inline: true },
            ],
            footer: { text: 'SCHWARZDEV' },
            image: image ? { url: image.url } : null,
        };

        const channel = client.channels.cache.get(CHANNEL_ID);
        if (channel) {
            await channel.send({ embeds: [embed] });
        }

        await interaction.reply({ content: '🎉 Değerlendirmeniz başarıyla kaydedildi!', ephemeral: true });
    }

    if (commandName === 'voucherbackup') {
        if (user.id !== BACKUP_USER_ID) {
            await interaction.reply({ content: '🚫 Bu komutu kullanma yetkiniz yok.', ephemeral: true });
            return;
        }

        const vouchers = await getVoucherData();
        if (vouchers.length === 0) {
            await interaction.reply({ content: '❗ Yedeklenecek değerlendirme yok!', ephemeral: true });
            return;
        }

        const backupChannel = client.channels.cache.get(BACKUP_CHANNEL_ID);
        if (!backupChannel) {
            await interaction.reply({ content: '⚠️ Yedekleme kanalı bulunamadı!', ephemeral: true });
            return;
        }

        for (let voucher of vouchers) {
            const embed = {
                color: 0x2196F3,
                title: '🎉 Değerlendirme',
                description: `📝 **Mesaj:**\n>>> ${voucher.message}\n`,
                fields: [
                    { name: '⭐ **Beğeni:**', value: '⭐'.repeat(voucher.stars), inline: false },
                    { name: '👤 **Kullanıcı:**', value: voucher.user, inline: true },
                    { name: '📅 **Tarih:**', value: voucher.date, inline: true },
                    { name: '⏰ **Saat:**', value: voucher.time, inline: true },
                ],
                footer: { text: 'SCHWARZDEV' },
                image: voucher.image ? { url: voucher.image } : null,
            };

            await backupChannel.send({ embeds: [embed] });
        }

        await interaction.reply({ content: '✅ Değerlendirmeler başarıyla yedeklendi!', ephemeral: true });
    }
});

client.login(TOKEN);
