require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('./models/Employee');

const employees = [
  { employeeId: '1', name: 'Mr. Senu Sam', designation: 'CEO', email: 'senu@mykarehealth.com', phone: '9962080966', dob: '1984-10-07', doj: '2022-01-03' },
  { employeeId: '15', name: 'Mr. Joash Philipose', designation: 'CPO', email: 'joash@mykarehealth.com', phone: '95661 00279', dob: '1992-09-12', doj: '2022-01-03' },
  { employeeId: '16', name: 'Mr. Atul Roy Alappat', designation: 'Sr.product and graphics Designer', email: 'atulalappat@gmail.com', phone: '70109 70543', dob: '1998-09-25', doj: '2022-01-03' },
  { employeeId: '17', name: 'Mr. M.Arun Jayakumar', designation: 'SR. manger marketing and branding', email: 'contactarunmmykare@gmail.com', phone: '8940442395', dob: '1995-07-17', doj: '2022-01-03' },
  { employeeId: '18', name: 'Mr. Rahmathulla TM', designation: 'CTO', email: 'rahmathulla.tm@mykarehealth.com', phone: '90377 29402', dob: '1990-01-31', doj: '2022-01-03' },
  { employeeId: '22', name: 'Mr. Muhammed Roshan', designation: 'Lead Associate Software Developer', email: 'roshan.mykare@gmail.com', phone: '70257 12278', dob: '1998-08-20', doj: '2022-01-03' },
  { employeeId: '46', name: 'Mr. Muhamed Shafneed MP', designation: 'Assosiate General Manager', email: 'finance@mykarehealth.com', phone: '75928 85529', dob: '2001-07-12', doj: '2022-09-12' },
  { employeeId: '68', name: 'Ms. Amrutha G R', designation: 'Manager - Digital Marketing', email: 'digital@mykarehealth.com', phone: '9744803838', dob: '1999-04-20', doj: '2023-01-03' },
  { employeeId: '146', name: 'Mr. Ajay Mathew', designation: 'Asst. HR manager', email: 'admin@mykarehealth.com', phone: '9946425875', dob: '1999-07-04', doj: '2024-03-11' },
  { employeeId: '182', name: 'Dr.Faseela Abdul Kareem', designation: 'Prodcut Manager', email: 'faseelamykare@gmail.com', phone: '7560893122', dob: '1997-10-10', doj: '2024-06-18' },
  { employeeId: '222', name: 'Mr. abhiraj K', designation: 'Sr.Software Developer', email: 'abhiraj.mykare@gmail.com', phone: '8943936250', dob: '2001-05-08', doj: '2024-11-04' },
  { employeeId: '231', name: 'Mr.Siril Sen P C', designation: 'QA Analyst', email: 'siril.mykare@gmail.com', phone: '9633309652', dob: '1993-09-15', doj: '2024-12-02' },
  { employeeId: '264', name: 'Mr. shehin Shaji', designation: 'DevOps Engineer', email: 'shehin.mykare@gmail.com', phone: '8921291957', dob: '1997-05-17', doj: '2025-01-14' },
  { employeeId: '301', name: 'Mr.Satheesh Babu .B', designation: 'Asst finance Manager', email: 'accounts@mykarehealth.com', phone: '9074245314', dob: '1995-06-07', doj: '2025-02-26' },
  { employeeId: '332', name: 'Mr. Fazil Rahman P', designation: 'Software Developer', email: 'fazilrahman.mykare@gmail.com', phone: '9846722185', dob: '2002-04-14', doj: '2025-05-19' },
  { employeeId: '366', name: 'Mr.Nimmala Krishna Chaithanya', designation: 'Sr. AI/ML Engineer', email: 'nimmalakrishnachaithanya.mykare@gmail.com', phone: '9848149475', dob: '2002-11-06', doj: '2026-02-03' },
  { employeeId: '367', name: 'Ms.Shreya Mohan Shet', designation: 'AI Engineer', email: 'shetshreyaa25@gmail.com', phone: '8104933752', dob: '2002-11-25', doj: '2026-07-20' },
];

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to database:', mongoose.connection.name);

  let added = 0;
  let updated = 0;

  for (const e of employees) {
    const existing = await Employee.findOne({ employeeId: e.employeeId });
    if (existing) {
      existing.name = e.name;
      existing.designation = e.designation;
      existing.email = e.email;
      existing.phone = e.phone;
      existing.dob = e.dob;
      existing.doj = e.doj;
      await existing.save();
      updated++;
      continue;
    }
    await Employee.create(e);
    added++;
  }

  const totalNow = await Employee.countDocuments();
  console.log(`Employees added: ${added}, updated existing: ${updated}`);
  console.log(`Total documents now in employees collection: ${totalNow}`);
  process.exit(0);
};

seed().catch((err) => {
  console.error('SEED ERROR:', err);
  process.exit(1);
});
