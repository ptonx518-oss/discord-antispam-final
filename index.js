const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const express = require("express");

// =====================================================
// 🌐 WEB SERVER
// =====================================================

const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 Discord Anti-Spam Bot is running!");
});

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    bot: client?.user?.tag || "connecting"
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// =====================================================
// 🔑 ENVIRONMENT VARIABLES
// =====================================================

const token = process.env.TOKEN;
const muteRoleId = process.env.MUTE_ROLE_ID;
const logChannelId = process.env.LOG_CHANNEL_ID;

// ตรวจสอบค่าที่จำเป็น
if (!token) {
  console.error("❌ ไม่พบ TOKEN");
  console.error("กรุณาตั้งค่า TOKEN ใน Secrets / Environment Variables");
  process.exit(1);
}

if (!muteRoleId) {
  console.warn("⚠️ ไม่พบ MUTE_ROLE_ID");
}

if (!logChannelId) {
  console.warn("⚠️ ไม่พบ LOG_CHANNEL_ID");
}

// =====================================================
// 🤖 DISCORD CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// =====================================================
// 📊 ANTI-SPAM SETTINGS
// =====================================================

const userMessages = new Map();

// ส่งข้อความกี่ครั้งภายในช่วงเวลา
const LIMIT = 5;

// ช่วงเวลา 5 วินาที
const TIME = 5000;

// ข้อความซ้ำกี่ครั้งจึงลงโทษ
const DUPLICATE_LIMIT = 3;

// ป้องกันการลงโทษซ้ำติด ๆ กัน
const punishedUsers = new Set();

// =====================================================
// 📩 ตรวจสอบข้อความ
// =====================================================

client.on("messageCreate", async (message) => {
  try {
    // ไม่ตรวจ DM
    if (!message.guild) return;

    // ไม่ตรวจข้อความจากบอท
    if (message.author.bot) return;

    // ถ้าไม่มี member
    if (!message.member) return;

    const userId = message.author.id;
    const now = Date.now();

    // สร้างข้อมูลผู้ใช้
    if (!userMessages.has(userId)) {
      userMessages.set(userId, []);
    }

    const data = userMessages.get(userId);

    // เพิ่มข้อความปัจจุบัน
    data.push({
      content: message.content,
      time: now
    });

    // เก็บเฉพาะข้อความในช่วงเวลาที่กำหนด
    const recent = data.filter(
      (msg) => now - msg.time < TIME
    );

    userMessages.set(userId, recent);

    // =================================================
    // 🚨 ตรวจส่งข้อความถี่เกิน
    // =================================================

    if (recent.length >= LIMIT) {

      if (punishedUsers.has(userId)) return;

      punishedUsers.add(userId);

      await punish(
        message,
        "ส่งข้อความถี่เกิน"
      );

      // ปลดล็อกหลัง 10 วินาที
      setTimeout(() => {
        punishedUsers.delete(userId);
      }, 10000);

      return;
    }

    // =================================================
    // 🚨 ตรวจข้อความซ้ำ
    // =================================================

    const duplicates = recent.filter(
      (msg) => msg.content === message.content
    );

    if (duplicates.length >= DUPLICATE_LIMIT) {

      if (punishedUsers.has(userId)) return;

      punishedUsers.add(userId);

      await punish(
        message,
        "ส่งข้อความซ้ำ"
      );

      // ปลดล็อกหลัง 10 วินาที
      setTimeout(() => {
        punishedUsers.delete(userId);
      }, 10000);

      return;
    }

  } catch (error) {
    console.error(
      "❌ Message Handler Error:",
      error
    );
  }
});

// =====================================================
// ⚠️ ลงโทษผู้ใช้
// =====================================================

async function punish(message, reason) {

  try {

    const member = message.member;
    const channel = message.channel;

    if (!member) return;

    console.log(
      `🚨 ตรวจพบสแปม: ${member.user.tag} | ${reason}`
    );

    // =================================================
    // 🔥 ลบข้อความของผู้ใช้
    // =================================================

    try {

      const fetched = await channel.messages.fetch({
        limit: 100
      });

      const userMsgs = fetched.filter(
        (m) => m.author.id === member.id
      );

      if (userMsgs.size > 0) {

        await channel.bulkDelete(
          userMsgs,
          true
        );

        console.log(
          `🗑️ ลบข้อความ ${userMsgs.size} ข้อความ`
        );
      }

    } catch (error) {

      console.error(
        "⚠️ ไม่สามารถลบข้อความ:",
        error.message
      );
    }

    // =================================================
    // ❌ ลบ Role เดิม
    // =================================================

    try {

      const rolesToRemove =
        member.roles.cache.filter(
          (role) => role.id !== message.guild.id
        );

      for (const role of rolesToRemove.values()) {

        // ข้าม Role ที่บอทจัดการไม่ได้
        if (!role.editable) {
          console.log(
            `⚠️ ไม่สามารถลบ Role: ${role.name}`
          );
          continue;
        }

        await member.roles
          .remove(role)
          .catch((error) => {
            console.error(
              `⚠️ ลบ Role ${role.name} ไม่สำเร็จ:`,
              error.message
            );
          });
      }

    } catch (error) {

      console.error(
        "⚠️ Role Error:",
        error.message
      );
    }

    // =================================================
    // 🔒 ใส่ Role Mute
    // =================================================

    if (muteRoleId) {

      try {

        const muteRole =
          message.guild.roles.cache.get(
            muteRoleId
          );

        if (!muteRole) {

          console.error(
            "❌ ไม่พบ MUTE_ROLE_ID ในเซิร์ฟเวอร์"
          );

        } else if (!muteRole.editable) {

          console.error(
            "❌ บอทไม่สามารถจัดการ Role Mute ได้"
          );

          console.error(
            "⚠️ ให้ย้าย Role ของบอทให้อยู่สูงกว่า Role Mute"
          );

        } else {

          await member.roles.add(
            muteRole
          );

          console.log(
            `🔒 ใส่ Role Mute ให้ ${member.user.tag}`
          );
        }

      } catch (error) {

        console.error(
          "❌ ใส่ Role Mute ไม่สำเร็จ:",
          error.message
        );
      }
    }

    // =================================================
    // 📢 Embed แจ้งเตือน
    // =================================================

    const embed = new EmbedBuilder()

      .setColor("#ff0000")

      .setTitle(
        "🚫 ระบบป้องกันสแปม"
      )

      .setDescription(
        `ผู้ใช้ ${member} ถูกดำเนินการ`
      )

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

    // ส่งแจ้งเตือน
    try {

      await channel.send({
        embeds: [embed]
      });

    } catch (error) {

      console.error(
        "⚠️ ส่งข้อความแจ้งเตือนไม่สำเร็จ:",
        error.message
      );
    }

    // =================================================
    // 📜 LOG CHANNEL
    // =================================================

    if (logChannelId) {

      try {

        const logChannel =
          message.guild.channels.cache.get(
            logChannelId
          );

        if (!logChannel) {

          console.error(
            "❌ ไม่พบ LOG_CHANNEL_ID"
          );

        } else {

          const logEmbed =
            new EmbedBuilder()

              .setColor("#ffa500")

              .setTitle(
                "📜 รายงานการสแปม"
              )

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

          console.log(
            "📜 ส่ง Log สำเร็จ"
          );
        }

      } catch (error) {

        console.error(
          "⚠️ ส่ง Log ไม่สำเร็จ:",
          error.message
        );
      }
    }

  } catch (error) {

    console.error(
      "❌ Punish Error:",
      error
    );
  }
}

// =====================================================
// 🟢 BOT READY
// =====================================================

client.once("clientReady", () => {

  console.log(
    "========================================"
  );

  console.log(
    `✅ บอทออนไลน์แล้ว: ${client.user.tag}`
  );

  console.log(
    `🆔 Bot ID: ${client.user.id}`
  );

  console.log(
    `🌐 Server: ${client.guilds.cache.size} เซิร์ฟเวอร์`
  );

  console.log(
    "🛡️ ระบบ Anti-Spam พร้อมทำงาน"
  );

  console.log(
    "========================================"
  );
});

// =====================================================
// ❌ DISCORD ERROR
// =====================================================

client.on("error", (error) => {

  console.error(
    "❌ Discord Client Error:",
    error
  );

});

// =====================================================
// 🔌 DISCONNECT
// =====================================================

client.on("shardDisconnect", (event, shardId) => {

  console.error(
    `⚠️ Discord Disconnect | Shard: ${shardId}`,
    event
  );

});

// =====================================================
// 🔄 RECONNECT
// =====================================================

client.on("shardReconnecting", (shardId) => {

  console.log(
    `🔄 กำลังเชื่อมต่อ Discord ใหม่ | Shard: ${shardId}`
  );

});

// =====================================================
// 🚀 LOGIN
// =====================================================

console.log(
  "🔄 กำลังเชื่อมต่อ Discord..."
);

client.login(token)

  .then(() => {

    console.log(
      "✅ Discord Login สำเร็จ"
    );

  })

  .catch((error) => {

    console.error(
      "❌ Discord Login ไม่สำเร็จ"
    );

    console.error(
      error
    );

  });
