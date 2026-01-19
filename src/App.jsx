import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// 引入你的兩個大元件
import MainSystem from './MainSystem'; 
import TeacherForm from './TeacherForm'; // 這是你要新做的那個老師表單頁面

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 當網址是 http://.../ 時，顯示主系統 */}
        <Route path="/" element={<MainSystem />} />

        {/* 當網址是 http://.../apply 時，顯示老師表單 */}
        <Route path="/apply" element={<TeacherForm />} />

        {/* 萬一老師打錯網址，自動導回主系統 */}
        <Route path="*" element={<MainSystem />} />
      </Routes>
    </Router>
  );
}