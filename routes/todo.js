const express = require('express');
const router = express.Router();
const { listTodos, createTodo, updateTodo, deleteTodo } = require('../controllers/todoController');
const { protect } = require('../middleware/auth');

router.use(protect); // every route below requires login — personal to each user, no role restriction

router.get('/', listTodos);
router.post('/', createTodo);
router.patch('/:id', updateTodo);
router.delete('/:id', deleteTodo);

module.exports = router;
