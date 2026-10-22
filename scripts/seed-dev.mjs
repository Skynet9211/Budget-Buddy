#!/usr/bin/env node
/**
 * Seeds a DEV Supabase project with mock data for one demo user:
 *   - 200 categories (20 groups x 10)
 *   - 10,000 transactions between 2020-01-01 and today (capped at 2026-12-31)
 *
 * Usage:
 *   npm run seed:dev                 # reads .env.seed
 *   npm run seed:dev -- --dry-run    # generate + print stats, touch nothing
 *
 * Needs (in .env.seed or the environment):
 *   SUPABASE_URL                 https://<dev-ref>.supabase.co  (or http://127.0.0.1:54321 for local)
 *   SUPABASE_SERVICE_ROLE_KEY    the dev project's secret / service_role key. NEVER commit it or put it in Netlify.
 *   DEMO_EMAIL, DEMO_PASSWORD    the demo login that will own the data
 *
 * Re-running is safe: it wipes the demo user's categories + transactions and re-creates them.
 * It only ever touches the demo user's rows.
 */
import { createClient } from "@supabase/supabase-js";

const CATEGORY_COUNT = 200;
const TXN_COUNT = 10_000;
const START = Date.UTC(2020, 0, 1);
const END = Math.min(Date.now(), Date.UTC(2026, 11, 31));
const CREDIT_SHARE = 0.12;
const EXTRA_CATEGORY_SHARE = 0.08; // debits that also belong to a 2nd category
const CHUNK = 1000;
const SEED = 20260101;

// --- Mock data ------------------------------------------------------------------------------

/** weight = how often the group is used; [min, max] = amount range in INR; skew > 1 = mostly small amounts. */
const GROUPS = [
  { name: "Food & Dining", weight: 5, range: [80, 1800], skew: 2.2,
    cats: ["Groceries", "Vegetables", "Fruits", "Dairy & eggs", "Snacks", "Restaurants", "Coffee & tea", "Street food", "Food delivery", "Bakery & sweets"],
    parties: ["Swiggy", "Zomato", "BigBasket", "Blinkit", "Zepto", "DMart", "Starbucks", "Dominos", "McDonald's", "Local vendor", "Haldiram's", "Chai Point"] },
  { name: "Transport", weight: 4, range: [30, 1500], skew: 2.5,
    cats: ["Fuel", "Auto rickshaw", "Taxi & cabs", "Ride sharing", "Metro", "Bus fare", "Train tickets", "Parking", "Tolls", "Bike rentals"],
    parties: ["Uber", "Ola", "Rapido", "Indian Oil", "HP Petrol Pump", "Metro card", "IRCTC", "FASTag", "RedBus"] },
  { name: "Housing", weight: 1.5, range: [500, 45000], skew: 1.6,
    cats: ["Rent", "Maintenance charges", "Property tax", "Home repairs", "Furniture", "Appliances", "Cleaning supplies", "Home decor", "Pest control", "Security deposit"],
    parties: ["Landlord", "Society office", "Urban Company", "IKEA", "Pepperfry", "Croma", "Local carpenter", "Plumber"] },
  { name: "Utilities & Bills", weight: 2.5, range: [150, 4000], skew: 1.8,
    cats: ["Electricity", "Water", "Cooking gas", "Broadband", "Mobile recharge", "DTH & cable", "Landline", "Sewage & waste", "Piped gas", "Bill late fees"],
    parties: ["BESCOM", "Tata Power", "Jio", "Airtel", "ACT Fibernet", "Tata Play", "Indane Gas", "BSNL", "Vi"] },
  { name: "Health", weight: 1.5, range: [100, 12000], skew: 2.2,
    cats: ["Doctor visits", "Medicines", "Lab tests", "Dental", "Eye care", "Hospital", "Gym membership", "Yoga & wellness", "Supplements", "Physiotherapy"],
    parties: ["Apollo Pharmacy", "MedPlus", "Practo", "Dr. Lal PathLabs", "Cult.fit", "1mg", "Fortis", "Local clinic", "Specsmakers"] },
  { name: "Entertainment", weight: 2, range: [100, 3000], skew: 2,
    cats: ["Movies", "Gaming", "Concerts & events", "Books & magazines", "Hobbies", "Board games", "Amusement parks", "Sports & turf", "Nightlife", "Art & craft"],
    parties: ["BookMyShow", "PVR", "INOX", "Steam", "PlayStation Store", "Crossword", "Amazon Kindle", "Playo", "Wonderla"] },
  { name: "Shopping", weight: 2.5, range: [200, 9000], skew: 2,
    cats: ["Clothing", "Footwear", "Accessories", "Electronics", "Mobile accessories", "Online shopping", "Cosmetics", "Jewellery", "Stationery", "Bags & luggage"],
    parties: ["Amazon", "Flipkart", "Myntra", "Ajio", "Nykaa", "Decathlon", "Zara", "H&M", "Reliance Digital", "Croma", "Tanishq", "Meesho"] },
  { name: "Travel", weight: 1, range: [500, 40000], skew: 1.8,
    cats: ["Flights", "Hotels", "Holiday packages", "Visa & passport", "Travel insurance", "Souvenirs", "Sightseeing", "Airport transfers", "Homestays", "Travel food"],
    parties: ["MakeMyTrip", "IndiGo", "Air India", "Booking.com", "Airbnb", "OYO", "Goibibo", "Cleartrip", "Yatra"] },
  { name: "Education", weight: 0.8, range: [300, 30000], skew: 2,
    cats: ["Tuition fees", "School fees", "Online courses", "Books & supplies", "Exam fees", "Coaching classes", "Certifications", "Workshops", "Software tools", "Library & membership"],
    parties: ["Udemy", "Coursera", "Unacademy", "Byju's", "Vedantu", "NPTEL", "School office", "Amazon Books", "British Council"] },
  { name: "Personal Care", weight: 1.2, range: [100, 3000], skew: 2,
    cats: ["Haircut", "Salon & spa", "Skincare", "Grooming", "Laundry", "Tailoring", "Perfume", "Massage", "Nail care", "Hygiene products"],
    parties: ["Naturals Salon", "Lakme Salon", "Urban Company", "Local barber", "Nykaa", "The Man Company", "Bombay Shaving Co.", "Dry cleaner"] },
  { name: "Family & Kids", weight: 1.2, range: [200, 8000], skew: 2,
    cats: ["Kids clothing", "Toys", "Baby care", "Daycare", "School supplies", "Pocket money", "Parents support", "Family outings", "Birthday parties", "Kids activities"],
    parties: ["FirstCry", "Hamleys", "Mom", "Dad", "Mothercare", "Daycare centre", "Funky Monkeys", "Archies"] },
  { name: "Gifts & Donations", weight: 0.8, range: [100, 10000], skew: 2.2,
    cats: ["Birthday gifts", "Wedding gifts", "Festival gifts", "Charity", "Temple donation", "Flowers", "Anniversary", "Baby shower", "Crowdfunding", "Return gifts"],
    parties: ["Ferns N Petals", "Archies", "Milaap", "Ketto", "Temple trust", "GiveIndia", "Cadbury Gifting", "Local florist"] },
  { name: "Pets", weight: 0.5, range: [100, 5000], skew: 2,
    cats: ["Pet food", "Vet visits", "Pet grooming", "Pet toys", "Pet vaccination", "Pet boarding", "Pet supplies", "Aquarium", "Pet insurance", "Pet training"],
    parties: ["Heads Up For Tails", "Supertails", "Pet clinic", "Drools", "Pedigree", "Local pet shop"] },
  { name: "Insurance & Finance", weight: 1, range: [500, 30000], skew: 1.7,
    cats: ["Life insurance", "Health insurance", "Vehicle insurance", "Bank charges", "Loan EMI", "Credit card payment", "Mutual fund SIP", "Stock investments", "Fixed deposit", "Income tax"],
    parties: ["LIC", "HDFC Life", "Star Health", "ICICI Lombard", "HDFC Bank", "SBI", "Zerodha", "Groww", "Kuvera", "Income Tax Dept"] },
  { name: "Subscriptions & Software", weight: 1.2, range: [99, 2500], skew: 2,
    cats: ["Cloud storage", "Music subscription", "Video subscription", "News subscription", "Productivity apps", "Domain & hosting", "VPN", "Antivirus", "Newsletters", "App store purchases"],
    parties: ["Netflix", "Spotify", "Amazon Prime", "Disney+ Hotstar", "Google One", "iCloud", "Notion", "GoDaddy", "NordVPN", "The Hindu", "YouTube Premium"] },
  { name: "Work & Business", weight: 1, range: [200, 20000], skew: 2,
    cats: ["Office supplies", "Coworking", "Freelance tools", "Client meals", "Business travel", "Printing & courier", "Equipment", "Marketing", "Professional fees", "Conference tickets"],
    parties: ["WeWork", "Awfis", "Figma", "Canva", "Delhivery", "Blue Dart", "Staples", "CA office", "Google Ads", "Meta Ads"] },
  { name: "Vehicle", weight: 1, range: [300, 25000], skew: 2.2,
    cats: ["Car wash", "Tyres", "Battery", "Car accessories", "Vehicle registration", "Challan & fines", "Bike repair", "Helmet & gear", "EV charging", "Roadside assistance"],
    parties: ["Local garage", "Bosch Car Service", "MRF Tyres", "Exide", "Traffic police", "RTO", "Tata Power EZ", "Autozone", "Local mechanic"] },
  { name: "Friends & Social", weight: 1.5, range: [100, 5000], skew: 2.2,
    cats: ["Dinner with friends", "Splitting bills", "Party", "Lent to friends", "Group trips", "Club membership", "Treats", "Borrowed repayment", "Team outings", "Weddings & functions"],
    parties: ["Akhil", "Rohan", "Priya", "Sneha", "Karthik", "Ananya", "Vikram", "Meera", "Arjun", "Divya"] },
  { name: "Miscellaneous", weight: 1, range: [50, 5000], skew: 2.4,
    cats: ["Cash withdrawal", "Miscellaneous", "Rounding off", "Repairs", "Postage", "Photocopy", "ATM fees", "Emergency", "One-off expenses", "Printing"],
    parties: ["ATM", "Post office", "Local shop", "Xerox shop", "Courier", "Unknown"] },
  // Income: used for credits (money in), not for debits.
  { name: "Income", weight: 0, range: [500, 150000], skew: 1.4, income: true,
    cats: ["Salary", "Freelance income", "Bonus", "Interest income", "Dividends", "Cashback", "Refunds", "Rental income", "Gifts received", "Reimbursements"],
    parties: ["Acme Technologies", "Employer", "Freelance client", "HDFC Bank interest", "Amazon refund", "Paytm cashback", "Tenant", "Mom", "Company reimbursement", "Zerodha dividend"] },
];

/** Ids from the payment_modes table (migration 007); weight = how often it is used. UPI dominates. */
const PAYMENT_MODES = [
  { id: "upi", weight: 68 },
  { id: "cash", weight: 14 },
  { id: "card", weight: 10 },
  { id: "netbanking", weight: 5 },
  { id: "wallet", weight: 2 },
  { id: "cheque", weight: 1 },
];

// --- Helpers --------------------------------------------------------------------------------

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

function weightedPick(items, weightOf) {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  let r = rand() * total;
  for (const it of items) {
    r -= weightOf(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

function buildData(userId) {
  // Categories
  const categories = [];
  for (const g of GROUPS) {
    g.catRows = g.cats.map((name) => {
      const row = { id: crypto.randomUUID(), user_id: userId, name };
      categories.push(row);
      return row;
    });
  }
  const lower = new Set(categories.map((c) => c.name.toLowerCase()));
  if (categories.length !== CATEGORY_COUNT || lower.size !== CATEGORY_COUNT) {
    throw new Error(`Expected ${CATEGORY_COUNT} unique categories, got ${categories.length} (${lower.size} unique)`);
  }
  if (categories.some((c) => c.name.length > 40)) throw new Error("Category name longer than 40 chars");

  const spendGroups = GROUPS.filter((g) => !g.income);
  const incomeGroup = GROUPS.find((g) => g.income);
  const days = Math.floor((END - START) / 86_400_000);

  const transactions = [];
  const dates = [];
  const amounts = [];
  const parties = [];
  const extraLinks = [];

  for (let i = 0; i < TXN_COUNT; i++) {
    const id = crypto.randomUUID();
    const credit = rand() < CREDIT_SHARE;
    const group = credit ? incomeGroup : weightedPick(spendGroups, (g) => g.weight);
    // Earlier categories in a group are used more often (Zipf-ish), like real life.
    const cat = weightedPick(group.catRows, (c) => 1 / (group.catRows.indexOf(c) + 1) ** 0.8);

    // Dates lean slightly towards recent years.
    const dayIdx = Math.min(days, Math.floor(days * rand() ** 0.8));
    const dayMs = START + dayIdx * 86_400_000;
    const date = isoDate(dayMs);
    const createdAt = new Date(dayMs + Math.floor(rand() * 86_400_000)).toISOString();

    const [min, max] = group.range;
    let amount = min + (max - min) * rand() ** group.skew;
    amount = rand() < 0.15 ? Math.round(amount * 100) / 100 : Math.round(amount);
    amount = Math.max(1, amount);

    const party = rand() < 0.95 ? pick(group.parties) : null;
    const [, m, d] = date.split("-").map(Number);
    const rawText = `${d} ${MONTHS[m - 1]}${party ? ` ${party.toLowerCase()}` : ""} ${Math.round(amount)}rs`;

    transactions.push({
      id, user_id: userId, type: credit ? "credit" : "debit", category_id: cat.id,
      payment_mode: weightedPick(PAYMENT_MODES, (m) => m.weight).id,
      raw_text: rawText, created_at: createdAt,
    });
    dates.push({ transaction_id: id, user_id: userId, txn_date: date });
    amounts.push({ transaction_id: id, user_id: userId, amount, currency: "INR" });
    if (party) parties.push({ transaction_id: id, user_id: userId, name: party });

    // Some debits belong to a second category too (transaction_categories is many-to-many).
    if (!credit && rand() < EXTRA_CATEGORY_SHARE) {
      const other = pick(pick(spendGroups).catRows);
      if (other.id !== cat.id) extraLinks.push({ transaction_id: id, category_id: other.id, user_id: userId });
    }
  }
  return { categories, transactions, dates, amounts, parties, extraLinks };
}

async function insertChunks(supabase, table, rows) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`${table} insert failed (rows ${i}-${i + CHUNK}): ${error.message}`);
  }
  console.log(`  ${table.padEnd(24)} ${rows.length}`);
}

async function findOrCreateUser(supabase, email, password) {
  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.data?.user) {
    console.log(`Created demo user ${email}`);
    return created.data.user.id;
  }
  // Already exists: find it and reset the password so the demo login always works.
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) {
      const { error: upErr } = await supabase.auth.admin.updateUserById(hit.id, { password, email_confirm: true });
      if (upErr) throw new Error(`Could not update demo user: ${upErr.message}`);
      console.log(`Using existing demo user ${email}`);
      return hit.id;
    }
    if (data.users.length < 200) break;
  }
  throw new Error(`Could not create demo user: ${created.error?.message ?? "unknown error"}`);
}

// --- Main -----------------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    const d = buildData("00000000-0000-0000-0000-000000000000");
    const dateList = d.dates.map((x) => x.txn_date).sort();
    const debits = d.transactions.filter((t) => t.type === "debit").length;
    console.log("DRY RUN (nothing written)");
    console.log(`  categories     ${d.categories.length}`);
    console.log(`  transactions   ${d.transactions.length} (${debits} debit, ${d.transactions.length - debits} credit)`);
    console.log(`  date range     ${dateList[0]} -> ${dateList[dateList.length - 1]}`);
    console.log(`  extra cat links ${d.extraLinks.length}`);
    return;
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!url || !key || !email || !password) {
    throw new Error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_EMAIL and DEMO_PASSWORD (see .env.seed.example).");
  }

  console.log(`Seeding ${url} as ${email}`);
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const userId = await findOrCreateUser(supabase, email, password);

  console.log("Clearing the demo user's old data...");
  // Deleting transactions cascades to dates, amounts, parties and transaction_categories.
  for (const table of ["transactions", "categories"]) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) throw new Error(`${table} delete failed: ${error.message}`);
  }

  const data = buildData(userId);
  console.log("Inserting...");
  await insertChunks(supabase, "categories", data.categories);
  // The sync_primary_category trigger adds each transaction's primary category to transaction_categories.
  await insertChunks(supabase, "transactions", data.transactions);
  await insertChunks(supabase, "transaction_dates", data.dates);
  await insertChunks(supabase, "transaction_amounts", data.amounts);
  await insertChunks(supabase, "transaction_parties", data.parties);
  await insertChunks(supabase, "transaction_categories", data.extraLinks);

  console.log(`\nDone. Sign in with ${email} / (your DEMO_PASSWORD).`);
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});
