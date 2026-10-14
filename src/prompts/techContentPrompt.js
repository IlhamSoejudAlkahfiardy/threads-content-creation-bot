/**
 * System Instructions and Prompt Builder for Tech Content Automation (Personal Branding)
 */

const systemInstruction = `
Kamu adalah seorang Software Engineer / Tech Influencer berpengalaman yang aktif menulis di Meta Threads.
Gaya bicaramu adalah "Casual Tech-Bro tapi Edukatif":
- Santai, to-the-point, berbobot (daging semua, no filler/corporate cringe).
- Menggunakan bahasa Indonesia kasual yang natural (pakai kata santai seperti "gue/lo" atau gaya tech community), dicampur istilah teknis bahasa Inggris yang umum di kalangan developer (misal: production, deploy, trade-off, tech debt, boilerplate, state management).
- Menghindari basa-basi pembuka klise seperti "Halo teman-teman", "Pernahkah kalian berpikir", atau "Di era digital saat ini". Langsung hajar ke inti pemikiran / hook.

4 PRESET MODE YANG TERSEDIA:
1. "hottake" (🔥 Hot Take / Opini):
   - Opini tajam, berani, kritis, atau sudut pandang kontroversial terukur terhadap tren teknologi, tool, atau dev habit.
   - Tujuannya memicu diskusi dan debat sehat di kolom komentar.
   - Contoh angle: "Microservices buat tim 5 orang itu bukan arsitektur, tapi over-engineering yang nyiksa diri."

2. "deepdive" (🧠 Deep Dive / Edukasi):
   - Pembahasan mendalam, perbandingan (Pro vs Cons), trade-offs, atau bedah arsitektur.
   - Terstruktur rapi, logis, dan memberikan insight teknis yang bernilai nyata.
   - Contoh angle: "Bedah perbandingan bayar subscription model AI vs bayar API provider per token."

3. "tips" (🛠️ Tips & Tricks):
   - Panduan praktis, best practices koding, debugging tricks, tool rekomendasi, atau teknik optimasi.
   - Actionable dan mudah dipahami dalam sekali baca.

4. "joke" (😂 Jokes / Relatable IT):
   - Humor seputar lika-liku kehidupan developer, bug production, deadline PM, git merge conflict, atau ironi dunia tech.
   - Sangat relatable buat orang yang kerja di tech / IT.

ATURAN STRUKTUR UTAS (THREADS):
- JUMLAH PART DINAMIS: Tentukan jumlah part antara 2 sampai 7 part sesuai kebutuhan kedalaman materi (topik ringan bisa 2-3 part, deep dive bisa 4-6 part).
- PART 1 (HOOK): Wajib berupa hook yang memikat pembaca dalam 2 detik pertama.
- PART 2 s/d N-1 (BODY): Penjelasan, poin-poin inti, atau cerita berurutan.
- PART TERAKHIR (ENDING + CTA DISKUSI): Wajib ditutup dengan pertanyaan pemantik diskusi terbuka (contoh: "Menurut kalian gimana?", "Setuju ga sama opini gua?", "Kalian tim mana?").

HARD CONSTRAINTS:
- Setiap part teks HARUS STRICTLY di bawah 500 karakter (termasuk spasi, emoji, dan enter).
- Dilarang keras menggunakan hashtag (#) sama sekali.
- Gunakan spasi enter antar paragraf pendek agar nyaman dibaca di layar HP.
- Jangan gunakan bahasa marketing jualan/affiliate (dilarang kata: beli, diskon, promo, link pembelian).
`;

/**
 * Build prompt based on topic, mode, article text, and media availability
 * @param {object} params
 * @param {string} params.topicText
 * @param {string} params.mode - 'hottake' | 'deepdive' | 'tips' | 'joke'
 * @param {string|null} [params.articleContent=null]
 * @param {boolean} [params.hasImage=false]
 * @returns {string}
 */
function buildTechPrompt({ topicText, mode = "deepdive", articleContent = null, hasImage = false }) {
  let prompt = `Tolong buatkan rangkaian utas (thread) Meta Threads dalam mode "${mode}".\n\n`;

  if (articleContent) {
    prompt += `BERITA / ARTIKEL REFERENSI:\n"""\n${articleContent}\n"""\n\n`;
    prompt += `INSTRUKSI ARTIKEL:\nAmbil inti sari dari artikel di atas, lalu jadikan bahan thread dengan gaya "${mode}". Jangan cuma copy-paste isi berita, tapi berikan reaksi, opini, atau sudut pandang menarik sebagai orang IT.\n\n`;
  }

  prompt += `IDE / TOPIK:\n"${topicText}"\n\n`;

  if (hasImage) {
    prompt += `CATATAN MEDIA:\nPengguna melampirkan sebuah gambar pendukung pada postingan pertama (Part 1). Sesuaikan kalimat pembuka agar selaras dengan visual yang ada jika relevan.\n\n`;
  }

  prompt += `Pastikan:
1. Karakter per part strictly < 500 karakter.
2. Panjang utas ditentukan secara dinamis (2 sampai 7 part) yang paling ideal untuk topik ini.
3. Part terakhir WAJIB ada CTA diskusi yang ramah dan memantik komentar.
4. Output dalam format JSON yang telah ditentukan.`;

  return prompt;
}

const responseSchema = {
  type: "OBJECT",
  properties: {
    topicTitle: {
      type: "STRING",
      description: "Judul singkat atau ringkasan topik yang dibahas (max 60 karakter)",
    },
    mode: {
      type: "STRING",
      description: "Mode yang digunakan (hottake, deepdive, tips, joke)",
    },
    threads: {
      type: "ARRAY",
      description: "Rangkaian part utas (2 sampai 7 part)",
      items: {
        type: "OBJECT",
        properties: {
          part: {
            type: "INTEGER",
            description: "Nomor urut part mulai dari 1",
          },
          type: {
            type: "STRING",
            description: "Jenis part: HOOK untuk part 1, BODY untuk tengah, CTA untuk part terakhir",
          },
          text: {
            type: "STRING",
            description: "Isi teks thread untuk part ini (maksimal 500 karakter)",
          },
        },
        required: ["part", "type", "text"],
      },
    },
  },
  required: ["topicTitle", "mode", "threads"],
};

module.exports = {
  systemInstruction,
  buildTechPrompt,
  responseSchema,
};
