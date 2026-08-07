require('dotenv').config();
const mongoose = require('mongoose');
const Department = require('./models/Department');

const departments = ['Finance', 'HR', 'Marketing', 'Product', 'Tech', 'Operations'];

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to database:', mongoose.connection.name);

  let added = 0;
  let skipped = 0;

  for (const name of departments) {
    const existing = await Department.findOne({ name }).collation({ locale: 'en', strength: 2 });
    if (existing) {
      skipped++;
      continue;
    }
    await Department.create({ name });
    added++;
  }

  const totalNow = await Department.countDocuments();
  console.log(`Departments added: ${added}, already existed (skipped): ${skipped}`);
  console.log(`Total documents now in departments collection: ${totalNow}`);
  process.exit(0);
};

seed().catch((err) => {
  console.error('SEED ERROR:', err);
  process.exit(1);
});
