const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const { muteRoleId, logChannelId } = require("./config.json");
const token = process.env.TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const userMessages = new Map();

const LIMIT = 5;
const TIME = 5000;
const DUPLICATE_LIMIT = 3;

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;

  const userId = message.author.id;
  const now = Date.now();

  if (!userMessages.has(userId)) {
    userMessages.set(userId, []);
  }

  const data = userMessages.get(userId);

  data.push({
    content: message.content,
    time: now
  });

  const recent = data.filter(msg => now - msg.time < TIME);
  userMessages.set(userId, recent);

  if (recent.length >= LIMIT) {
    return punish(message, "ส่งข้อความถี่เกิน");
  }

  const duplicates = recent.filter(msg => msg.content === message.content);
  if (duplicates.length >= DUPLICATE_LIMIT) {
    return punish(message, "ส่งข้อความซ้ำ");
  }
});

async function punish(message, reason) {
  try {
    const member = message.member;
    const channel = message.channel;

    // 🔥 ลบข้อความทั้งหมด
    const fetched = await channel.messages.fetch({ limit: 100 });
    const userMsgs = fetched.filter(m => m.author.id === member.id);
    await channel.bulkDelete(userMsgs, true);

    // ❌ ลบ role ทั้งหมด (ยกเว้น @everyone)
    const rolesToRemove = member.roles.cache.filter(role => role.id !== message.guild.id);
    for (const role of rolesToRemove.values()) {
      await member.roles.remove(role).catch(() => {});
    }

    // 🔒 ใส่ยศกักบริเวณ
    await member.roles.add(muteRoleId);

    // 📢 Embed แจ้งเตือน
    const embed = new EmbedBuilder()
      .setColor("#ff0000")
      .setTitle("🚫 ระบบป้องกันสแปม")
      .setDescription(`ผู้ใช้ ${member} ถูกดำเนินการ`)
      .addFields(
        { name: "📌 เหตุผล", value: reason, inline: true },
        { name: "👤 ผู้ใช้", value: member.user.tag, inline: true },
        { name: "🆔 ID", value: member.id, inline: false }
      )
      .setFooter({ text: "Server Security System" })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // 📜 Log ห้องแอดมิน
    const logChannel = message.guild.channels.cache.get(logChannelId);

    const logEmbed = new EmbedBuilder()
      .setColor("#ffa500")
      .setTitle("📜 รายงานการสแปม")
      .addFields(
        { name: "👤 ผู้ใช้", value: member.user.tag, inline: true },
        { name: "🆔 ID", value: member.id, inline: true },
        { name: "📌 เหตุผล", value: reason, inline: false },
        { name: "📍 ห้อง", value: channel.name, inline: false }
      )
      .setFooter({ text: "Anti-Spam Log" })
      .setTimestamp();

    if (logChannel) {
      logChannel.send({ embeds: [logEmbed] });
    }

  } catch (err) {
    console.log("ERROR:", err);
  }
}

client.login(token);
