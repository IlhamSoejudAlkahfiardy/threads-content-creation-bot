require("dotenv").config();
const { generateAffiliateThreads } = require("./src/services/geminiService");

// Default sample brief if none provided via command line arguments
const defaultBrief = `
produk: Smartberry Universal  STYLUS PEN 3 IN 1 - Pulpen + Stylus Layar Sentuh + Ujung Presisi untuk Semua Tablet & Smartphone

harga: 17 ribuan

Link:
https://vt.tokopedia.com/t/ZS9S2UuyCb78Y-uTP4F/
`;
// const defaultBrief = `
// Smartberry Universal STYLUS PEN 3 IN 1
// - Pulpen biasa untuk nulis di kertas / catatan manual
// - Stylus layar sentuh kapasitif universal (kompatibel iPad, tablet Android, iPhone, smartphone)
// - Ujung presisi transparent disc untuk gambar detail dan tanda tangan digital
// - Material body aluminium alloy premium ringan
// - Link pembelian: https://tokopedia.link/stylus-universal-3in1
// `;

const userArg = process.argv.slice(2).join(" ");
const briefToTest = userArg.trim() || defaultBrief.trim();

async function runTest() {
  console.log("=======================================================");
  console.log("🧪 TESTING GENERASI PROMPT ORGANIK THREADS");
  console.log("=======================================================\n");
  console.log("📥 INPUT BRIEF:");
  console.log(briefToTest);
  console.log("\n⏳ Sedang memproses dengan Gemini AI (gemini-2.5-flash)...\n");

  const startTime = Date.now();

  try {
    const result = await generateAffiliateThreads(briefToTest, []);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("==================== HASIL GENERASI ====================");
    console.log(`🛍️  Produk   : ${result.productName}`);
    console.log(`🏷️  Kategori : ${result.category}`);
    console.log(`⏱️  Durasi   : ${duration} detik`);
    console.log("========================================================\n");

    result.threads.forEach((t) => {
      const typeBadge =
        t.type === "HOOK"
          ? "🎣 PART 1 - HOOK"
          : t.type === "MAIN_CONTENT"
          ? "📖 PART 2 - MAIN CONTENT"
          : "🔗 PART 3 - CLOSING & LINK";

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`${typeBadge} [${t.charCount}/500 karakter]`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(t.text);
      console.log("");
    });

    console.log("=======================================================");
    console.log("✅ Generasi selesai dan struktur valid!");
    console.log("=======================================================");
  } catch (error) {
    console.error("\n❌ Error saat generasi:", error.message);
    if (error.response?.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

runTest();
