require('dotenv').config();
const mongoose = require('mongoose');
const Holiday = require('./models/Holiday');

const holidays = [
  // National Holidays
  { name: 'Republic Day', date: '2026-01-26', type: 'national' },
  { name: 'May Day', date: '2026-05-01', type: 'national' },
  { name: 'Independence Day', date: '2026-08-15', type: 'national' },
  { name: 'Gandhi Jayanthy', date: '2026-10-02', type: 'national' },

  // Festival Holidays
  { name: 'Mannam Jayanthi', date: '2026-01-02', type: 'festival' },
  { name: "Id-ul-Fitr (Ramzan)", date: '2026-03-20', type: 'festival' },
  { name: 'Good Friday', date: '2026-04-03', type: 'festival' },
  { name: 'Vishu', date: '2026-04-15', type: 'festival' },
  { name: "Id-ul-Adha (Bakrid)", date: '2026-05-27', type: 'festival' },
  { name: 'First Onam / Milad-i-Sherif (Birthday of Prophet Muhammed)', date: '2026-08-25', type: 'festival' },
  { name: 'Thiruvonam', date: '2026-08-26', type: 'festival' },
  { name: 'Vijayadasami', date: '2026-10-21', type: 'festival' },
  { name: 'Christmas', date: '2026-12-25', type: 'festival' },
];

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to database:', mongoose.connection.name);
  console.log('Connected to host:', mongoose.connection.host);

  let added = 0;
  let skipped = 0;

  for (const h of holidays) {
    const exists = await Holiday.findOne({ name: h.name, date: new Date(h.date) });
    if (exists) {
      skipped++;
      continue;
    }
    const created = await Holiday.create(h);
    console.log(`Inserted: ${created.name} -> _id ${created._id}`);
    added++;
  }

  const totalNow = await Holiday.countDocuments();
  console.log(`Holidays added: ${added}, already existed (skipped): ${skipped}`);
  console.log(`Total documents now in holidays collection: ${totalNow}`);
  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
