require("dotenv").config();
const { generateTechThreads } = require("./src/services/geminiService");

const defaultTopic =
  "Pro cons langganan AI model subscription (seperti ChatGPT Plus/Claude Pro) vs bayar API provider per token";

const userArg = process.argv.slice(2).join(" ");
const topicToTest = userArg.trim() || defaultTopic;
const modeToTest = process.env.TEST_MODE || "deepdive";

async function runTest() {
  console.log("=======================================================");
  console.log("🧪 TESTING GENERASI THREADS TECH CONTENT (PERSONAL BRANDING)");
  console.log("=======================================================\n");
  console.log(`📥 TOPIK : "${topicToTest}"`);
  console.log(`🎭 MODE  : ${modeToTest}`);
  console.log("\n⏳ Sedang memproses dengan Gemini AI (gemini-2.5-flash)...\n");

  const startTime = Date.now();

  try {
    const result = await generateTechThreads({
      topicText: topicToTest,
      mode: modeToTest,
      articleContent: null,
      hasImage: false,
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("==================== HASIL GENERASI ====================");
    console.log(`💡 Judul Topik : ${result.topicTitle}`);
    console.log(`🎭 Mode        : ${result.mode}`);
    console.log(`📊 Total Part  : ${result.threads.length} parts`);
    console.log(`⏱️ Durasi      : ${duration} detik`);
    console.log("========================================================\n");

    let allUnder500 = true;
    result.threads.forEach((t) => {
      const typeBadge =
        t.type === "HOOK"
          ? "🎣 PART " + t.part + " - HOOK"
          : t.type === "CTA"
          ? "📢 PART " + t.part + " - CTA DISKUSI"
          : "📖 PART " + t.part + " - BODY";

      if (t.charCount > 500) allUnder500 = false;

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`${typeBadge} [${t.charCount}/500 karakter]`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(t.text);
      console.log("");
    });

    console.log("=======================================================");
    if (allUnder500) {
      console.log("✅ Generasi selesai! Semua part STRICTLY di bawah 500 karakter.");
    } else {
      console.log("⚠️ Ada part yang melebihi 500 karakter!");
    }
    console.log("=======================================================");
  } catch (error) {
    console.error("\n❌ Error saat generasi:", error.message);
    if (error.response?.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

runTest();
