// ==================== YOUR KEYS ====================
const SUPABASE_URL = "https://alwpjflnbfseazgdzohp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_7yTKTJmcRY5_QBUl8RQWVA_WVhZsO8c";   // ← your real key

const supabase = Supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let foodBanks = [];
const cheeseImages = [
  "https://picsum.photos/seed/cheddar/300/400",
  "https://picsum.photos/seed/brie/300/400",
  "https://picsum.photos/seed/stilton/300/400",
  "https://picsum.photos/seed/camembert/300/400",
  "https://picsum.photos/seed/gruyere/300/400",
  "https://picsum.photos/seed/manchego/300/400"
];

async function loadFoodBanks() {
  const { data } = await supabase
    .from('food_banks')
    .select('*')
    .in('status', ['approved', 'auto_approved']);
  foodBanks = data || [];
  document.getElementById("approved").textContent = `Approved & Live: ${foodBanks.length}`;
}

async function spinBandit() {
  if (foodBanks.length === 0) {
    document.getElementById("result").innerHTML = "No approved food banks yet – submit some!";
    return;
  }
  const winner = foodBanks[Math.floor(Math.random() * foodBanks.length)];
  const reels = [document.getElementById("reel1"), document.getElementById("reel2"), document.getElementById("reel3")];

  reels.forEach((reel, i) => {
    let spins = 18 + Math.random() * 22;
    let idx = 0;
    const interval = setInterval(() => {
      reel.innerHTML = `<img src="${cheeseImages[idx % cheeseImages.length]}" alt="">`;
      idx++; spins--;
      if (spins <= 0) {
        clearInterval(interval);
        reel.innerHTML = `<img src="${cheeseImages[Math.floor(Math.random()*cheeseImages.length)]}" alt="">`;
      }
    }, 85 - i * 18);
  });

  setTimeout(() => {
    document.getElementById("result").innerHTML = `
      <strong>${winner.name}</strong><br>
      ${winner.country}<br><br>
      <a href="${winner.donation_url}" target="_blank">
        <button style="background:#ffeb3b;padding:20px;font-size:22px;">DONATE ON THEIR OFFICIAL SITE</button>
      </a>`;
  }, 2400);
}

async function submitFoodBank() {
  const name = document.getElementById("name").value.trim();
  const country = document.getElementById("country").value.trim();
  const url = document.getElementById("url").value.trim();
  if (!name || !country || !url) return alert("❌ Fill all fields!");

  await supabase.from('submissions').insert([{ name, country, donation_url: url }]);

  const threeDaysAgo = new Date(Date.now() - 72*60*60*1000).toISOString();
  const { count } = await supabase
    .from('submissions')
    .select('*', { count: 'exact' })
    .eq('donation_url', url)
    .gte('created_at', threeDaysAgo);

  if (count >= 3) {
    await supabase.from('food_banks').insert([{ name, country, donation_url: url, status: 'auto_approved' }]);
    document.getElementById("submitMsg").innerHTML = "🎉 AUTO-APPROVED & LIVE!";
  } else {
    await supabase.from('food_banks').insert([{ name, country, donation_url: url, status: 'pending' }]);
    document.getElementById("submitMsg").innerHTML = "✅ Submitted – needs more votes for auto-approval";
  }
  await loadFoodBanks();
}

function toggleRoyal() {
  const p = document.getElementById("royalPanel");
  p.style.display = p.style.display === "none" ? "block" : "none";
}

// Load on start
loadFoodBanks();
