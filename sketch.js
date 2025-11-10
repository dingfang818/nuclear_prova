/**
 * P5.js 最终增强版：地图 + 底部滚动时间轴 + 顶部迷你导航条
 * * 修正内容：
 * 1. P5.js 主画布高度扩大，使其覆盖地图区域和时间轴区域。
 * 2. 连线直接延伸到时间轴的中心轴线，实现穿透效果。
 * 3. 移除地图底边的分隔线。
 */

let table;
let rawData = [];
let groupedData = []; 
let selectedEvent = null; 

// === 动态配置变量 ===
let CANVAS_WIDTH;         // P5.js 宽度 (windowWidth)
let CANVAS_HEIGHT;        // P5.js 实际高度 (windowHeight - NAV_HEIGHT)
let MAP_BOUNDARY_Y;       // 地图和时间轴容器的分界 Y 坐标

const START_YEAR = 1945;
const END_YEAR = 1998;
const YEAR_SCALE = 25;     
const TIMELINE_START_X = 50; 
const TIMELINE_HEIGHT = 250; 
const NAV_HEIGHT = 40;       
let TIMELINE_Y_OFFSET;    // 时间轴中轴线在 TIMELINE_HEIGHT 中的 Y 坐标

let TIMELINE_TOTAL_WIDTH; 

// === P5.js 实例和高亮变量 ===
let navSketch; 
let highlightedYear = 0; // 当前中心年份

function preload() {
  table = loadTable('dataset-modified.csv', 'csv', 'header'); 
}

function setup() {
  CANVAS_WIDTH = windowWidth;
  // 关键修正：P5.js 高度 = 窗口高度 - 导航条高度
  CANVAS_HEIGHT = windowHeight - NAV_HEIGHT; 
  CANVAS_HEIGHT = max(CANVAS_HEIGHT, TIMELINE_HEIGHT + 50); 
  
  // 地图/时间轴的分界线 Y 坐标
  MAP_BOUNDARY_Y = CANVAS_HEIGHT - TIMELINE_HEIGHT; 
  
  // 主画布创建：使用新的高度
  createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT).parent('main-canvas-container');
  
  TIMELINE_Y_OFFSET = TIMELINE_HEIGHT / 2; 
  TIMELINE_TOTAL_WIDTH = (END_YEAR - START_YEAR) * YEAR_SCALE * 3 + TIMELINE_START_X * 2; 

  textAlign(CENTER, TOP); 
  textSize(10);

  // 1. 原始数据提取
  for (let r = 0; r < table.getRowCount(); r++) {
    rawData.push({
      country: table.getString(r, 'country'),
      year: int(table.getString(r, 'year')),
      latitude: float(table.getString(r, 'latitude')),
      longitude: float(table.getString(r, 'longitude')),
      avgYield: float(table.getString(r, 'average_yield')),
      region: table.getString(r, 'region')
    });
  }

  // 2. 数据整合和分组
  groupedData = aggregateData(rawData);
  
  // 3. 预计算坐标和事件位置
  calculateCoordinates();
  
  // 4. 渲染 DOM 时间轴事件
  renderDomTimeline();
  
  // 5. 创建迷你导航条 P5.js 实例
  navSketch = new p5(navConstructor, 'nav-container');
  
  // 初始化高亮年份
  updateYearHighlightFromScroll(); 
}

function windowResized() {
  CANVAS_WIDTH = windowWidth;
  CANVAS_HEIGHT = windowHeight - NAV_HEIGHT;
  CANVAS_HEIGHT = max(CANVAS_HEIGHT, TIMELINE_HEIGHT + 50); 
  
  MAP_BOUNDARY_Y = CANVAS_HEIGHT - TIMELINE_HEIGHT; 

  resizeCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  
  TIMELINE_TOTAL_WIDTH = (END_YEAR - START_YEAR) * YEAR_SCALE * 3 + TIMELINE_START_X * 2; 

  calculateCoordinates(); 
  renderDomTimeline(); 
  
  if (navSketch) {
      navSketch.resizeCanvas(windowWidth, NAV_HEIGHT); 
      navSketch.redraw();
  }
}

// *** 聚合数据函数 (已修正排序错误) ***
function aggregateData(data) {
    const groups = {};
    data.forEach(item => {
        const key = `${item.country}-${item.year}`;
        if (!groups[key]) {
            groups[key] = { country: item.country, year: item.year, count: 0, regions: new Set(), latSum: 0, lonSum: 0 };
        }
        groups[key].count++;
        groups[key].regions.add(item.region);
        groups[key].latSum += item.latitude;
        groups[key].lonSum += item.longitude;
    });

    const result = Object.values(groups).map(group => ({
        ...group,
        regions: Array.from(group.regions),
        avgLat: group.latSum / group.count,
        avgLon: group.lonSum / group.count,
        mapX: 0, mapY: 0, timelineX: 0, timelineY: 0,
    }));
    
    result.sort((a, b) => (a.year * 100 + a.country.charCodeAt(0)) - (b.year * 100 + b.country.charCodeAt(0)));
    
    return result;
}

// *** 坐标计算函数 ***
function calculateCoordinates() {
    let minLon = -180;
    let maxLon = 180;
    let minLat = -90;
    let maxLat = 90;
    
    let currentYOffset = {}; 
    const BASE_Y = TIMELINE_Y_OFFSET + 15;
    const LINE_HEIGHT = 42; 

    const MAP_PADDING_X = 0; 
    const MAP_PADDING_Y_TOP = NAV_HEIGHT; 
    const MAP_PADDING_Y_BOTTOM = 0; 

    for (let i = 0; i < groupedData.length; i++) {
        let item = groupedData[i];

        item.mapX = map(item.avgLon, minLon, maxLon, MAP_PADDING_X, CANVAS_WIDTH - MAP_PADDING_X);
        
        // 关键修正：地图点 Y 轴映射到 MAP_BOUNDARY_Y 范围内
        item.mapY = map(item.avgLat, minLat, maxLat, MAP_BOUNDARY_Y - MAP_PADDING_Y_BOTTOM, MAP_PADDING_Y_TOP); 

        item.timelineX = TIMELINE_START_X + (item.year - START_YEAR) * YEAR_SCALE * 3;
        
        let yearKey = item.year.toString();
        currentYOffset[yearKey] = currentYOffset[yearKey] || 0;
        
        item.timelineY = BASE_Y + currentYOffset[yearKey];
        
        currentYOffset[yearKey] += LINE_HEIGHT;
    }
}

// *** 渲染 DOM 时间轴事件 (保持不变) ***
function renderDomTimeline() {
    const timelineEventsDiv = document.getElementById('timeline-events');
    timelineEventsDiv.innerHTML = '';
    timelineEventsDiv.style.width = `${TIMELINE_TOTAL_WIDTH}px`;

    // 1. 绘制时间轴线 (保持不变)
    const timelineLine = document.createElement('div');
    timelineLine.style.position = 'absolute';
    timelineLine.style.top = `${TIMELINE_Y_OFFSET}px`;
    timelineLine.style.left = '0';
    timelineLine.style.width = '100%';
    timelineLine.style.height = '1px';
    timelineLine.style.backgroundColor = '#999';
    timelineEventsDiv.appendChild(timelineLine);

    // 2. 绘制年份刻度 (保持不变)
    for (let year = START_YEAR; year <= END_YEAR; year += 5) {
        let x = TIMELINE_START_X + (year - START_YEAR) * YEAR_SCALE * 3;
        
        const tick = document.createElement('div');
        tick.style.position = 'absolute';
        tick.style.left = `${x}px`;
        tick.style.top = `${TIMELINE_Y_OFFSET - 5}px`;
        tick.style.width = '1px';
        tick.style.height = '10px';
        tick.style.backgroundColor = '#000';
        timelineEventsDiv.appendChild(tick);
        
        const yearLabel = document.createElement('div');
        yearLabel.className = 'event-label';
        yearLabel.style.left = `${x}px`;
        yearLabel.style.top = `${TIMELINE_Y_OFFSET - 40}px`;
        yearLabel.textContent = year;
        yearLabel.style.width = '40px';
        yearLabel.style.transform = 'translateX(-50%)';
        timelineEventsDiv.appendChild(yearLabel);
    }
    
    // 3. 绘制事件标签 (保持不变)
    groupedData.forEach(item => {
        const labelDiv = document.createElement('div');
        labelDiv.className = 'event-label';
        labelDiv.id = `event-${item.country}-${item.year}`;
        
        const content = `${item.country} ${item.year}\n(${item.count}次)`;
        labelDiv.textContent = content;
        labelDiv.style.whiteSpace = 'pre'; 
        
        labelDiv.style.left = `${item.timelineX}px`;
        labelDiv.style.top = `${item.timelineY}px`;
        labelDiv.style.transform = 'translateX(-50%)'; 
        
        labelDiv.onclick = () => {
            selectedEvent = item;
            redraw(); 
            updateYearHighlightFromMapClick(item.year);
        };

        const dot = document.createElement('div');
        dot.style.position = 'absolute';
        dot.style.width = '6px';
        dot.style.height = '6px';
        dot.style.backgroundColor = '#000';
        dot.style.borderRadius = '50%';
        dot.style.top = `${TIMELINE_Y_OFFSET - 3}px`;
        dot.style.left = `${item.timelineX - 3}px`;
        timelineEventsDiv.appendChild(dot);
        
        const line = document.createElement('div');
        line.style.position = 'absolute';
        line.style.left = `${item.timelineX}px`;
        line.style.top = `${TIMELINE_Y_OFFSET}px`;
        line.style.width = '1px';
        line.style.height = `${item.timelineY - TIMELINE_Y_OFFSET}px`;
        line.style.borderLeft = '1px dashed #aaa';
        timelineEventsDiv.appendChild(line);

        timelineEventsDiv.appendChild(labelDiv);
    });
    
    // 监听主时间轴滚动事件，更新高亮年份并重绘迷你导航条和主画布（连线需要重绘）
    document.getElementById('timeline-container').onscroll = () => {
        updateYearHighlightFromScroll(); 
        if (navSketch) navSketch.redraw();
        redraw(); // 必须重绘主画布以更新连线
    };
}

// *** 高亮更新函数 (保持不变) ***
function updateYearHighlightFromScroll() {
    const timelineContainer = document.getElementById('timeline-container');
    const scrollCenterAbsolute = timelineContainer.scrollLeft + timelineContainer.clientWidth / 2; 
    
    const normalizedX = scrollCenterAbsolute - TIMELINE_START_X;
    const totalContentWidth = (END_YEAR - START_YEAR) * YEAR_SCALE * 3;
    
    let ratio = normalizedX / totalContentWidth;
    ratio = constrain(ratio, 0, 1);
    
    const newHighlightedYear = floor(map(ratio, 0, 1, START_YEAR, END_YEAR + 1));
    
    if (newHighlightedYear !== highlightedYear) {
        highlightedYear = newHighlightedYear;
        highlightDomYear(highlightedYear); 
    }
}

function updateYearHighlightFromMapClick(year) {
    if (year !== highlightedYear) {
        highlightedYear = year;
        highlightDomYear(highlightedYear);
        if (navSketch) navSketch.redraw();
    }
}

// *** 高亮对应年份的 DOM 事件标签 ***
function highlightDomYear(year) {
    document.querySelectorAll('.event-label').forEach(el => {
        el.style.fontWeight = 'normal';
        el.style.backgroundColor = 'transparent'; 
    });
    
    groupedData.filter(item => item.year === year).forEach(item => {
        const el = document.getElementById(`event-${item.country}-${item.year}`);
        if (el) {
            el.style.fontWeight = 'bold'; 
            el.style.backgroundColor = '#ffd8b3'; 
        }
    });
}


// *** P5.js 主画布绘制循环 ***
function draw() {
    // 绘制地图背景 (填充地图区域)
    fill(240); 
    noStroke();
    rect(0, 0, CANVAS_WIDTH, MAP_BOUNDARY_Y);
    
    // 1. 绘制地图上的点
    drawMap(); 
    
    // 2. 绘制地图点到时间轴的连线
    drawConnectionLines(); 

    // 3. 绘制标题 (在顶部)
    fill(0);
    textSize(16);
    textAlign(CENTER, TOP);
    text("全球核试验整合事件分布图", CANVAS_WIDTH / 2, 10); 

    // 4. 绘制详情面板
    if (selectedEvent) {
        drawRegionDetails(selectedEvent);
    }
}

// *** drawMap (保持全屏，无边框) ***
function drawMap() {
    let colorMap = {
      'USA': color(255, 0, 0, 180), 'RUSSIA': color(0, 0, 255, 180), 'FRANCE': color(0, 255, 0, 180),
      'UK': color(255, 165, 0, 180), 'CHINA': color(255, 255, 0, 180), 'INDIA': color(128, 0, 128, 180),
      'PAKISTAN': color(0, 128, 128, 180), '': color(150)
    };

    for (let item of groupedData) {
        let c = colorMap[item.country] || colorMap[''];
        
        // 如果是选中的事件，或者属于高亮年份，给予特殊边框
        if (selectedEvent === item) {
            stroke(255, 100, 0); strokeWeight(3); fill(c);
        } else if (item.year === highlightedYear) {
            stroke(255, 150, 0); strokeWeight(2); fill(c);
        } else {
            noStroke(); fill(c);
        }

        let pointSize = constrain(map(item.count, 1, 100, 5, 25), 5, 25); 
        ellipse(item.mapX, item.mapY, pointSize);
    }
}

// *** 修正：绘制连线到时间轴的中心轴线 ***
function drawConnectionLines() {
    const timelineContainer = document.getElementById('timeline-container');
    const scrollLeft = timelineContainer.scrollLeft;
    
    // 遍历所有数据点
    groupedData.forEach(item => {
        const isHighlighted = item.year === highlightedYear;
        
        const mapX = item.mapX;
        const mapY = item.mapY; 

        // 终点 X 坐标: 绝对位置 - 滚动距离
        const timelineCanvasX = item.timelineX - scrollLeft;
        
        // 关键修正：连线延伸到时间轴的中心轴线 (Y 坐标 = 地图边界 Y + 时间轴中轴线 Y)
        const timelineCanvasY = MAP_BOUNDARY_Y + TIMELINE_Y_OFFSET; 

        // 设置样式：高亮使用粗橙色，默认使用细浅灰色
        if (isHighlighted) {
            stroke(255, 100, 0, 255); 
            strokeWeight(2);
        } else {
            stroke(150, 150, 150, 100); 
            strokeWeight(0.5);
        }
        noFill();
        
        // 连线起点 (地图点)
        const x1 = mapX;
        const y1 = mapY;
        
        // 连线终点 (时间轴中心线上的投影点)
        const x4 = timelineCanvasX;
        const y4 = timelineCanvasY;
        
        // 控制点 1: 在地图边界 (MAP_BOUNDARY_Y)
        const x2 = x1;
        const y2 = MAP_BOUNDARY_Y; 
        
        // 控制点 2: 在时间轴中心线 (timelineCanvasY)，X 坐标与终点相同
        const x3 = x4;
        const y3 = timelineCanvasY; 
        
        // 使用贝塞尔曲线连接
        bezier(x1, y1, x2, y2, x3, y3, x4, y4);
    });
}


function drawRegionDetails(event) {
    const PANEL_WIDTH = 250; 
    // 面板 Y 坐标基于 MAP_BOUNDARY_Y 调整
    const PANEL_Y = MAP_BOUNDARY_Y - 200; 
    const PANEL_X = 50; 
    const PANEL_HEIGHT = 180;
    
    fill(255, 255, 200); stroke(100); rect(PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, 5);

    fill(0); textSize(14); textAlign(LEFT, TOP);
    let title = `${event.country} ${event.year} 试验地区 (${event.count}次):`;
    text(title, PANEL_X + 10, PANEL_Y + 10, PANEL_WIDTH - 20, 30);
    
    textSize(10); let y = PANEL_Y + 45;
    event.regions.forEach(region => { 
        if (y < PANEL_Y + PANEL_HEIGHT - 15) { text(`• ${region}`, PANEL_X + 10, y); y += 15; } 
    });
}

function mouseClicked() {
    // 鼠标点击判断范围需要扩展到 MAP_BOUNDARY_Y
    for (let item of groupedData) {
        if (mouseY >= 0 && mouseY <= MAP_BOUNDARY_Y) {
            if (dist(mouseX, mouseY, item.mapX, item.mapY) < 15) { 
                selectedEvent = item; 
                highlightDomEvent(item); 
                updateYearHighlightFromMapClick(item.year); 
                return; 
            }
        }
    }
    if (mouseY < MAP_BOUNDARY_Y) { selectedEvent = null; highlightDomEvent(null); }
}


// --- P5.js 迷你导航条实例 (保持不变) ---
function navConstructor(n) {
    const NAV_LINE_Y = NAV_HEIGHT - 10;
    
    n.setup = function() {
        n.createCanvas(CANVAS_WIDTH, NAV_HEIGHT); 
        n.textAlign(n.CENTER, n.CENTER);
        n.textSize(10);
        n.noLoop(); 
        
        n.canvas.addEventListener('click', n.handleNavClick);
    };
    
    n.windowResized = function() {
        CANVAS_WIDTH = windowWidth;
        n.resizeCanvas(CANVAS_WIDTH, NAV_HEIGHT); 
        n.redraw();
    };
    
    n.draw = function() {
        n.background(220); 
        
        const navRange = n.width - 20; 
        const totalYears = END_YEAR - START_YEAR;
        const PIXELS_PER_YEAR_IN_NAV = navRange / totalYears; 
        
        // 1. 绘制导航条主线
        n.stroke(150);
        n.line(10, NAV_LINE_Y, n.width - 10, NAV_LINE_Y);
        
        // 2. 绘制年份刻度 (精确到每年 + 高亮)
        
        for (let year = START_YEAR; year <= END_YEAR; year++) { 
            let x = n.map(year, START_YEAR, END_YEAR, 10, n.width - 10);

            // 设置高亮颜色
            if (year === highlightedYear) { 
                n.fill(255, 100, 0); 
                n.stroke(255, 100, 0);
            } else {
                n.fill(0);
                n.stroke(0);
            }
            
            let tickHeight = (year % 5 === 0) ? 5 : 3;
            n.line(x, NAV_LINE_Y - tickHeight, x, NAV_LINE_Y + tickHeight);
            
            // 绘制每年的年份文本 (防止重叠)
            if (PIXELS_PER_YEAR_IN_NAV > 20 || year % 5 === 0) {
                 n.textSize(8);
                 n.text(year, x, NAV_LINE_Y - 12);
            } else if (PIXELS_PER_YEAR_IN_NAV > 10) {
                 n.textSize(7);
                 n.push();
                 n.translate(x, NAV_LINE_Y - 5); 
                 n.rotate(-n.PI / 4); 
                 n.textAlign(n.LEFT, n.CENTER); 
                 n.text(year, 0, 0); 
                 n.pop();
            }
        }
        
        // 3. 绘制当前视图指示器 (短滑块)
        const centerYearX = n.map(highlightedYear, START_YEAR, END_YEAR, 10, n.width - 10);
        
        const indicatorW = PIXELS_PER_YEAR_IN_NAV;
        
        const finalIndicatorX = centerYearX - indicatorW / 2; 

        n.noStroke();
        n.fill(0, 0, 255, 150); // 半透明蓝色
        n.rect(finalIndicatorX, NAV_LINE_Y - 8, indicatorW, 16, 3);
        
        n.stroke(0, 0, 200);
        n.noFill();
        n.rect(finalIndicatorX, NAV_LINE_Y - 8, indicatorW, 16, 3);
    };
    
    // *** 点击导航条跳转逻辑 (保持不变) ***
    n.handleNavClick = (event) => {
        const x = event.offsetX;

        const navRangeStart = 10;
        const navRangeEnd = CANVAS_WIDTH - 10;
        
        const targetAbsoluteX = n.map(
            x, 
            navRangeStart, 
            navRangeEnd, 
            0, 
            TIMELINE_TOTAL_WIDTH 
        );
        
        const timelineContainer = document.getElementById('timeline-container');
        const containerWidth = timelineContainer.clientWidth;
        
        let targetScrollLeft = targetAbsoluteX - containerWidth / 2;
        
        const scrollMax = TIMELINE_TOTAL_WIDTH - containerWidth;
        targetScrollLeft = n.constrain(targetScrollLeft, 0, scrollMax);
        
        timelineContainer.scrollLeft = targetScrollLeft;

        const normalizedX = targetAbsoluteX - TIMELINE_START_X;
        const totalContentWidth = (END_YEAR - START_YEAR) * YEAR_SCALE * 3;
        
        let ratio = normalizedX / totalContentWidth;
        ratio = n.constrain(ratio, 0, 1);
        
        const targetYear = floor(n.map(ratio, 0, 1, START_YEAR, END_YEAR + 1));
        
        if (targetYear !== highlightedYear) {
             highlightedYear = targetYear;
             highlightDomYear(highlightedYear);
             n.redraw(); 
             redraw(); // 强制主画布重绘，更新连线
        } else {
             n.redraw();
             redraw();
        }
    };
}