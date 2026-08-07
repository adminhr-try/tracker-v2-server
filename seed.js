require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const exists = await User.findOne({ email: 'ceo@company.com' });
  if (exists) {
    console.log('Seed user already exists');
    return process.exit(0);
  }

  await User.create({
    name: 'Founder CEO',
    email: 'ceo@company.com',
    password: 'ChangeMe123', // change immediately after first login
    role: 'ceo',
  });

  console.log('CEO account created: ceo@company.com / ChangeMe123');
  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
