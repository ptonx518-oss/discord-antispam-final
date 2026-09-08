const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const express = require("express");
const app = express();

// 🔑 ENV
const token = process.env.TOKEN;
const muteRoleId = process.env.MUTE_ROLE_ID;
const logChannelId = process.env.LOG_CHANNEL_ID;

if (!token) {
  console.error("❌ ไม่พบ TOKEN");
  process.exit(1);
}

// 🌐 Web Server
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 Discord Bot is running!");
});

app.listen(PORT, () => {
  console.log("🌐 Web server running on port " + PORT);
});

// 🤖 Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// 📊 เก็บข้อความ
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

  const recent = data.filter(
    msg => now - msg.time < TIME
  );

  userMessages.set(userId, recent);

  if (recent.length >= LIMIT) {
    return punish(message, "ส่งข้อความถี่เกิน");
  }

  const duplicates = recent.filter(
    msg => msg.content === message.content
  );

  if (duplicates.length >= DUPLICATE_LIMIT) {
    return punish(message, "ส่งข้อความซ้ำ");
  }
});

async function punish(message, reason) {
  try {
    const member = message.member;
    const channel = message.channel;

    if (!member) return;

    // 🔥 ลบข้อความ
    const fetched = await channel.messages.fetch({
      limit: 100
    });

    const userMsgs = fetched.filter(
      m => m.author.id === member.id
    );

    if (userMsgs.size > 0) {
      await channel.bulkDelete(userMsgs, true);
    }

    // ❌ ลบ Role
    const rolesToRemove = member.roles.cache.filter(
      role => role.id !== message.guild.id
    );

    for (const role of rolesToRemove.values()) {
      await member.roles.remove(role).catch(() => {});
    }

    // 🔒 ใส่ยศ Mute
    if (muteRoleId) {
      await member.roles.add(muteRoleId);
    }

    // 📢 แจ้งเตือน
    const embed = new EmbedBuilder()
      .setColor("#ff0000")
      .setTitle("🚫 ระบบป้องกันสแปม")
      .setDescription(`ผู้ใช้ ${member} ถูกดำเนินการ`)
      .addFields(
        {
          name: "📌 เหตุผล",
          value: reason,
          inline: true
        },
        {
          name: "👤 ผู้ใช้",
          value: member.user.tag,
          inline: true
        },
        {
          name: "🆔 ID",
          value: member.id
        }
      )
      .setFooter({
        text: "Server Security System"
      })
      .setTimestamp();

    await channel.send({
      embeds: [embed]
    });

    // 📜 Log
    if (logChannelId) {
      const logChannel =
        message.guild.channels.cache.get(logChannelId);

      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor("#ffa500")
          .setTitle("📜 รายงานการสแปม")
          .addFields(
            {
              name: "👤 ผู้ใช้",
              value: member.user.tag,
              inline: true
            },
            {
              name: "🆔 ID",
              value: member.id,
              inline: true
            },
            {
              name: "📌 เหตุผล",
              value: reason
            },
            {
              name: "📍 ห้อง",
              value: channel.name
            }
          )
          .setFooter({
            text: "Anti-Spam Log"
          })
          .setTimestamp();

        await logChannel.send({
          embeds: [logEmbed]
        });
      }
    }

  } catch (err) {
    console.error("❌ ERROR:", err);
  }
}

// 🤖 Bot Ready
client.once("ready", () => {
  console.log(`✅ บอทออนไลน์แล้ว: ${client.user.tag}`);
});

// 🚀 Login
client.login(token)
  .then(() => {
    console.log("🔄 กำลังเชื่อมต่อ Discord...");
  })
  .catch(err => {
    console.error("❌ Discord Login Error:", err.message);
  });
