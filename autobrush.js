// ==UserScript==
// @name         岐黄天使刷课
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  try to take over the world!
// @author       wwx
// @match        http://www.tcm512.com/pages_jsp/mobile/courseLearn.html?courseId*
// @require      http://cdn.staticfile.org/moment.js/2.24.0/moment.min.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=greasyfork.org
// @grant        GM_addStyle
// ==/UserScript==
let study_css = `
    button.egg_study_btn {
      outline:0;
      border:0;
      position:fixed;
      top:5px;
      left:10px;
      padding:12px 20px;
      border-radius:10px;
      background-color:#d90609;
      color:#fff;
      font-size:18px;
      font-weight:bold;
      text-align:center;
      z-index:9;
    }
    button.egg_study_btn:disabled {
      background-color: rgb(217, 6, 9, .5);
    }
    h2 {
      position: relative;
      font-size: 1.5em;
      margin: 0.5em 0;
    }
    ol,ul {
      padding: 0;
      list-style: none;
      max-height: 160px;
      overflow: auto;
    }
    ol::-webkit-scrollbar, ul::-webkit-scrollbar {
        width: 4px;
    }
    ol::-webkit-scrollbar-thumb, ul::-webkit-scrollbar-thumb {
        border-radius: 10px;
        box-shadow: inset 0 0 5px rgba(0,0,0,0.2);
        background: rgba(0,0,0,0.2);
    }
    ol::-webkit-scrollbar-track, ul::-webkit-scrollbar-track {
        box-shadow: inset 0 0 5px rgba(0,0,0,0.2);
        border-radius: 0;
        background: rgba(0,0,0,0.1);
    }
    p {
      margin: 0;
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
    }
    span.count {
      position: absolute;
      top: 2px;
      right: 5px;
      display: inline-block;
      padding: 0 5px;
      height: 20px;
      border-radius: 20px;
      background: #e6e6fa;
      line-height: 22px;
      text-align: center;
      color: #666;
      font-size: 14px;
    }
    li {
      height: 32px;
      line-height: 32px;
      background: #fff;
      position: relative;
      margin-bottom: 10px;
      padding: 0 6px;
      border-radius: 3px;
      border-left: 5px solid #d60609;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.07);
    }
    ol li {
      cursor: move;
    }
    ul li {
      border-left: 5px solid #999;
      opacity: 0.5;
    }
    @media screen and (max-device-width: 620px) {
      section {
        width: 96%;
        padding: 2% 0;
      }
    }
    @media screen and (min-width: 620px) {
      section {
        width: 288px;
        padding: 10px 0;
      }
    }
    .main-contanier {
      position: fixed;
      top: 70px;
      left: 10px;
      background-color: #e5e5e5;
      width: 300px;
      border-radius: 6px;
      box-shadow: 0px 0px 9px #d5d5d5;
      padding: 6px;
      height: 600px;
      z-index: 10;
    }
    .btn-container {
      display: flex;
      justify-content: space-between;
    }
    .btn-container button {
      padding: 6px 24px;
      border: 1px solid #e3e3e3;
      border-radius: 6px;
      font-weight: bold;
    }
    .btn-container button:hover {
      cursor: pointer;
    }
    .btn-container button.add {
      background-color: #d90609;
      color: #fff;
      flex: 1;
    }
  `;
GM_addStyle(study_css);
const unlearnedArr$ = []; // 未学的课
let courseArr$ = []; // 待刷的课程
// 获取所有未学的课
$(".course-learn-box").append(
    `<button class="egg_study_btn" id="getCourseBtn">获取课程</button>`
);
$("#getCourseBtn").on("click", function () {
    $("#getCourseBtn").attr({
        disabled: true
    });
    checkLearned();
});

// 检查今日已学习了多少节课
function checkLearned() {
    $.ajax({
        url: "http://www.tcm512.com/p_commoncall.do",
        type: "post",
        dataType: "json",
        data: {
            pn: "p_xxpt2022_checkUserXs",
            pv: courseId,
        },
        success: function (data) {
            createList(data.commonobj[0]);
        },
        error: function (error) {
            scAlert("获取今日已学课程失败！！！");
        },
    });
}

// 创建今日待学课程DOM
function createList(num) {
    $.each($(".new_bg"), function (index, item) {
        if (item.innerHTML.indexOf("已学完") === -1) {
            const course = {
                id: item.id,
                title: item.onclick.toString().split("'")[1],
                value: 0,
            };
            unlearnedArr$.push(course);
        }
    });
    unlearnedArr$.splice(30 - num);
    // 展示dom
    $(".course-learn-box").append(
        `
      <div class="main-contanier">
        <div class="btn-container">
          <button id="run" class="add">开刷</button>
        </div>
        <section>
          <h2 class="title">还未开始 <span class="count" id="todocount"></span></h2>
          <ol id="todolist" class="demo-box"></ol>
          <h2 class="title">正在进行</h2>
          <ol id="doinglist"></ol>
          <h2 class="title">已经完成 <span class="count" id="donecount"></span></h2>
          <ul id="donelist"></ul>
        </section>
      </div>
    `
    );
    // 为开刷按钮绑定事件
    const addBtn = $("#run");
    addBtn.on("click", function () {
        addBtn.attr({
            disabled: true
        });
        addBtn.text("刷课中...");
        brush();
    });
    loadlist();
}

// 加载列表
function loadlist() {
    $("ol, ul").empty();
    let todoCount = 0;
    let doneCount = 0;
    $.each(unlearnedArr$, function (index, item) {
        switch (item.value) {
            case 0:
                $("#todolist").append(`<li><p>${item.title}</p></li>`);
                todoCount++;
                break;
            case 1:
                $("#doinglist").append(`<li><p>${item.title}</p></li>`);
                break;
            case 2:
                $("#donelist").append(`<li><p>${item.title}</p></li>`);
                doneCount++;
                break;
            default:
                break;
        }
    });
    $("#todocount").text(todoCount);
    $("#donecount").text(doneCount);
}

// 刷课函数
function brush() {
    courseArr$ = unlearnedArr$.filter((item) => item.value !== 2);
    if (courseArr$[0]?.id) {
        changeValue(1, courseArr$[0].id);
        loadlist();
        getvideoUrl(courseArr$[0].id, courseArr$[0].title);
        xgplayer.once('canplay', function () {
            xgplayer.volume = 0;
            xgplayer.play();
        })
        xgplayer.once('ended', function () {
            changeValue(2, cid);
            brush();
        })
    } else {
        scAlert("刷完啦！！！");
    }
}

// 改变id值
function changeValue(val, num) {
    const index = unlearnedArr$.findIndex((oItem) => num === oItem.id);
    unlearnedArr$[index].value = val;
    loadlist();
}

// 西瓜视频注册事件
xgplayer.on('pause', function () {
    if ($('#verify').css('display') !== "none") {
        $('#verify').hide();
        xgplayer.play();
        console.log("关闭弹窗验证");
    }
})