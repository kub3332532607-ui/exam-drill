// 科目清單與資料登記處。每科一個檔（data/pol.js 等），用 KS.add 放入章節、申論題、考卷。
window.KS = {
  subjects: [
    { id: "chn", name: "國文" },
    { id: "con", name: "憲法" },
    { id: "jur", name: "法學緒論" },
    { id: "eng", name: "英文", noReview: true, link: "https://claude.ai/artifact/WFkk5GwjDHk7HbVjvNf4MG", linkText: "單字程式" },
    { id: "adm", name: "行政學" },
    { id: "alaw", name: "行政法" },
    { id: "pol", name: "政治學" },
    { id: "pub", name: "公共管理" }
  ],
  chapters: {}, essays: [], exams: [],
  add: function (d) {
    if (d.chapters) this.chapters[d.subject] = (this.chapters[d.subject] || []).concat(d.chapters);
    (d.essays || []).forEach(function (e) { e.subject = e.subject || d.subject; KS.essays.push(e); });
    (d.exams || []).forEach(function (e) { e.subject = e.subject || d.subject; KS.exams.push(e); });
  }
};
