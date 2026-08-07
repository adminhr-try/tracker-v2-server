const express = require('express');
const router = express.Router();
const { listDepartments, createDepartment } = require('../controllers/departmentController');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect); // every route below requires login

router.get('/', listDepartments); // visible to all roles
router.post('/', requireRole(['hr', 'ceo']), createDepartment);

module.exports = router;
