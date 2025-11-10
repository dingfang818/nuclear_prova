/**
 * P5.js Final Revised Version (V M - Curve Above, Line Below)
 * Functionality: 
 * ... (Previous features maintained)
 * 6. YEAR_SCALE increased to 40 for wider spacing.
 * 7. Tooltip (small black semi-transparent box) functionality and DOM setup removed.
 * 8. MODIFIED: Connection lines use a Bezier curve from map point to the TIMELINE_Y_OFFSET, 
 * and a straight vertical line from TIMELINE_Y_OFFSET to the colored dot.
 * 9. MODIFIED: Remove legend to timeline connection lines, keep only map to timeline connections.
 * 10. MODIFIED: Change hover to click for timeline labels tooltips, keep map points hover.
 * 11. MODIFIED: When clicking timeline country labels, show tooltip and change connection lines to red.
 * 12. MODIFIED: When clicking legend country and then timeline country, keep both connection lines visible.
 */

// === Global Variables ===
let table;
let rawData = []; 
let groupedData = []; 
let selectedRawEvent = null; 
let selectedCountry = null;    
let selectedGroup = null; 
let detailsPanel; // DOM element for the details panel
let hoveredRawEvent = null; // Track hovered map point
let clickedGroup = null; // Track clicked timeline label

// === GeoJSON Variables ===
let worldData; 
const GEOJSON_URL = "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";

// === Performance Variables ===
let scrollingTimer;
let IS_SCROLLING = false;
const SCROLL_DEBOUNCE_TIME = 150; 

// === Dynamic Configuration Variables ===
let CANVAS_WIDTH = 0;         
let CANVAS_HEIGHT = 0;        
let MAP_BOUNDARY_Y = 0;       
const NAV_HEIGHT = 40;       
const LEGEND_HEIGHT = 40;     
const MAP_TOP_PADDING = NAV_HEIGHT + LEGEND_HEIGHT + 10; 

const START_YEAR = 1945;
const END_YEAR = 1998;
const YEAR_SCALE = 40;     
const TIMELINE_START_X = 50; 

// *** CONFIGURATION FOR RAISING THE TIMELINE AND DOT/LABEL POSITIONING ***
const TIMELINE_HEIGHT = 300;     
// Y position of the main horizontal timeline line (from the top of the timeline-container)
let TIMELINE_Y_OFFSET = 30;     
let TIMELINE_TOTAL_WIDTH = 0; 

// === Panel Constants (for DOM placement) ===
const PANEL_DOM_WIDTH = 320;
const PANEL_DOM_HEIGHT = 180; 
const PANEL_DOM_X = 50;
const PANEL_DOM_Y_OFFSET_FROM_BOTTOM = 10; 
let PANEL_DOM_Y = 0; 

// === Timeline Constants (for compression) ===
const LINE_HEIGHT = 30; // Vertical spacing between stacked labels
const LABEL_HEIGHT = 16; // Fixed height for a country label

// === P5.js Instances and Highlight Variables ===
let navSketch; 
let highlightedYear = 0; 

// --- Color Map (USSR) ---
const RAW_COLOR_VALUES = {
    'USA': [255, 0, 0, 255], 'USSR': [0, 0, 255, 255], 'FRANCE': [0, 255, 0, 255], 
    'UK': [255, 165, 0, 255], 'CHINA': [255, 255, 0, 255], 'INDIA': [128, 0, 128, 255],
    'PAKISTAN': [0, 128, 128, 255], '': [150]
};
let P5_COLOR_MAP = {}; 

const HEX_COLOR_MAP = {
    'USA': '#ff0000', 'USSR': '#0000ff', 'FRANCE': '#00ff00', 
    'UK': '#ffa500', 'CHINA': '#ffff00', 'INDIA': '#800080',
    'PAKISTAN': '#008080', '': '#969696'
};

const COUNTRIES_ORDER = ['USA', 'USSR', 'FRANCE', 'UK', 'CHINA', 'INDIA', 'PAKISTAN']; 

function getCountryColorHex(country) {
    return HEX_COLOR_MAP[country] || HEX_COLOR_MAP[''];
}

// =======================================================
// === Core Interaction Helpers ===
// =======================================================

function updateYearHighlightFromScroll() {
    const timelineContainer = document.getElementById('timeline-container');
    const scrollCenterAbsolute = timelineContainer.scrollLeft + timelineContainer.clientWidth / 2; 
    
    const normalizedX = scrollCenterAbsolute - TIMELINE_START_X;
    const totalContentWidth = (END_YEAR - START_YEAR) * YEAR_SCALE * 3;
    
    let ratio = normalizedX / totalContentWidth;
    ratio = constrain(ratio, 0, 1);
    
    const newHighlightedYear = floor(map(ratio, 0, 0.9999, START_YEAR, END_YEAR));
    
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

function highlightDomYear(year) {
    document.querySelectorAll('.country-label').forEach(el => {
        el.style.fontWeight = 'normal';
        el.style.backgroundColor = 'transparent'; 
        el.style.color = '#333';
        el.style.border = 'none'; 
    });
    
    let targetCountry = selectedCountry;
    let targetGroup = selectedGroup;

    if (selectedRawEvent) {
        targetCountry = selectedRawEvent.country;
        targetGroup = groupedData.find(g => g.country === targetCountry && g.year === selectedRawEvent.year);
    } 

    if (targetGroup) {
        const el = document.getElementById(`event-${targetGroup.country}-${targetGroup.year}`);
        if (el) {
             el.style.fontWeight = 'bold';
             el.style.backgroundColor = 'rgba(255, 192, 128, 0.5)';
             el.style.color = '#000';
             el.style.border = '1px solid #ff9900';
        }
    } else if (selectedCountry) {
        // 当有选中国家时，只高亮该国家的所有标签，不按年份高亮
        groupedData.filter(item => item.country === selectedCountry).forEach(item => {
            const el = document.getElementById(`event-${item.country}-${item.year}`);
            if (el) {
                el.style.fontWeight = 'bold'; 
                // 移除年份条件，所有该国家的标签都使用相同样式
                el.style.backgroundColor = 'rgba(255, 229, 204, 0.5)';
                el.style.color = '#333';
                el.style.border = '1px dashed #ff9900';
            }
        });
    } else {
        // 只有当没有选中国家时，才按年份高亮
        groupedData.filter(item => item.year === year).forEach(item => {
            const el = document.getElementById(`event-${item.country}-${item.year}`);
            if (el) {
                el.style.fontWeight = 'bold'; 
                el.style.backgroundColor = 'rgba(255, 216, 179, 0.5)'; 
                el.style.color = '#333';
            }
        });
    }
}

// === 修改图例点击函数 ===
window.handleLegendClick = function(countryName) {
    if (selectedCountry === countryName) {
        selectedCountry = null;
        selectedRawEvent = null;
        selectedGroup = null;
        // 不清除 clickedGroup，保持时间轴点击状态
        highlightedYear = 0;
    } else {
        selectedCountry = countryName;
        selectedRawEvent = null; 
        selectedGroup = null; 
        // 不清除 clickedGroup，保持时间轴点击状态
        // 当图例点击时，设置 highlightedYear 为 0，隐藏导航栏滑动块
        highlightedYear = 0;
    }
    
    highlightDomYear(highlightedYear);
    if (navSketch) navSketch.redraw();
    redraw(); 
}

// =======================================================
// === Core Data Processing ===
// =======================================================

function aggregateDataForTimeline(data) {
    const groups = {};
    data.forEach(item => {
        const key = `${item.country}-${item.year}`;
        if (!groups[key]) {
            groups[key] = { 
                country: item.country, 
                year: item.year, 
                count: 0, 
                events: [], 
            };
        }
        groups[key].count++;
        
        groups[key].events.push({
            country: item.country, 
            year: item.year,       
            region: item.region || 'N/A',
            latitude: item.latitude,
            longitude: item.longitude,
            yield: item.yield_1 || 'N/A', 
            depth: item.depth || 'N/A',   
            purpose: item.purpose || 'N/A', 
            name: item.name || 'N/A',     
            date: item.date_DMY || 'N/A', 
            mapX: 0,     
            mapY: 0,
        });
    });

    const result = Object.values(groups).map(group => ({
        ...group,
        mapX: 0, mapY: 0, timelineX: 0, timelineY: 0,
    }));
    
    result.sort((a, b) => (a.year * 100 + a.country.charCodeAt(0)) - (b.year * 100 + b.country.charCodeAt(0)));
    
    return result;
}

// =======================================================
// === P5.js Lifecycle and Core Render Functions ===
// =======================================================

function preload() {
  table = loadTable('dataset-modified.csv', 'csv', 'header'); 
  worldData = loadJSON(GEOJSON_URL, onGeoJSONLoaded, onGeoJSONLoadError);
}

function onGeoJSONLoaded() {}
function onGeoJSONLoadError(error) {
    console.error("GeoJSON Data failed to load:", error);
}

function setup() {
  for (const country in RAW_COLOR_VALUES) {
      const raw = RAW_COLOR_VALUES[country];
      if (raw.length === 4) {
          P5_COLOR_MAP[country] = color(raw[0], raw[1], raw[2], raw[3]);
      } else {
          P5_COLOR_MAP[country] = color(raw[0]);
      }
  }

  if (!table || table.getRowCount() === 0) {
      console.error("CSV Data failed to load or is empty.");
      createCanvas(windowWidth, 100).parent('main-canvas-container').background(150);
      textSize(16); fill(0); text("Data loading failed. Check CSV file.", windowWidth / 2, 50);
      noLoop(); 
      return;
  }
  
  CANVAS_WIDTH = windowWidth;
  CANVAS_HEIGHT = windowHeight - NAV_HEIGHT; 
  CANVAS_HEIGHT = max(CANVAS_HEIGHT, TIMELINE_HEIGHT + 50); 
  
  MAP_BOUNDARY_Y = CANVAS_HEIGHT - TIMELINE_HEIGHT; 
  PANEL_DOM_Y = MAP_BOUNDARY_Y - PANEL_DOM_HEIGHT - PANEL_DOM_Y_OFFSET_FROM_BOTTOM; 
  
  let mainCanvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT).parent('main-canvas-container');
  mainCanvas.elt.style.zIndex = 999; 
  
  TIMELINE_TOTAL_WIDTH = (END_YEAR - START_YEAR) * YEAR_SCALE * 3 + TIMELINE_START_X * 2; 

  textAlign(CENTER, TOP); 
  textSize(10);

  for (let r = 0; r < table.getRowCount(); r++) {
    let countryName = table.getString(r, 'country');
    if (countryName === 'RUSSIA') { 
        countryName = 'USSR';
    }
    
    const item = {
      country: countryName, 
      year: int(table.getString(r, 'year')),
      latitude: float(table.getString(r, 'latitude')),
      longitude: float(table.getString(r, 'longitude')),
      avgYield: float(table.getString(r, 'average_yield')),
      region: table.getString(r, 'region'),
      depth: table.getString(r, 'depth'),
      yield_1: table.getString(r, 'yield_1'),
      purpose: table.getString(r, 'purpose'),
      name: table.getString(r, 'name'),
      date_DMY: table.getString(r, 'date_DMY'),
      mapX: 0, mapY: 0, 
    };
    rawData.push(item);
  }

  groupedData = aggregateDataForTimeline(rawData);
  
  calculateCoordinates();
  
  setupDomDetailsPanel(); 
  renderDomTimeline();
  renderLegendDom(); 
  
  navSketch = new p5(navConstructor, 'nav-container');
  
  updateYearHighlightFromScroll(); 
  
  frameRate(60); 
}

function windowResized() {
  if (table && table.getRowCount() > 0) {
      CANVAS_WIDTH = windowWidth;
      CANVAS_HEIGHT = windowHeight - NAV_HEIGHT;
      CANVAS_HEIGHT = max(CANVAS_HEIGHT, TIMELINE_HEIGHT + 50); 
      
      MAP_BOUNDARY_Y = CANVAS_HEIGHT - TIMELINE_HEIGHT; 
      PANEL_DOM_Y = MAP_BOUNDARY_Y - PANEL_DOM_HEIGHT - PANEL_DOM_Y_OFFSET_FROM_BOTTOM; 

      resizeCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
      TIMELINE_TOTAL_WIDTH = (END_YEAR - START_YEAR) * YEAR_SCALE * 3 + TIMELINE_START_X * 2; 
      calculateCoordinates(); 
      renderDomTimeline(); 
      
      if (detailsPanel) {
          detailsPanel.style.top = `${PANEL_DOM_Y}px`; 
      }
      
      const legendDiv = document.getElementById('legend-container');
      if (legendDiv) {
         legendDiv.style.top = `${NAV_HEIGHT}px`;
      }
      
      if (navSketch) {
          navSketch.resizeCanvas(windowWidth, NAV_HEIGHT); 
          navSketch.redraw();
      }
  }
}

function draw() {
    if (!table || table.getRowCount() === 0) return; 
    background(240); 
    drawWorldMap(); 
    
    // === 修改：绘制连接线的逻辑 ===
    // 1. 首先绘制选中国家的所有连接线（橙色）
    if (selectedCountry) {
        const countryEvents = rawData.filter(item => item.country === selectedCountry);
        countryEvents.forEach(item => {
            // 如果是点击的时间轴组对应的点，不绘制橙色线（后面会绘制红色线）
            if (!clickedGroup || !(clickedGroup.country === item.country && clickedGroup.year === item.year)) {
                drawConnectionLines(item, color(255, 150, 0, 150));
            }
        });
    }
    
    // 2. 绘制点击的时间轴组的红色连接线（最高优先级）
    if (clickedGroup) {
        clickedGroup.events.forEach(eventDetail => {
            const rawEvent = rawData.find(r => 
                r.country === clickedGroup.country && 
                r.year === clickedGroup.year && 
                r.latitude === eventDetail.latitude && 
                r.longitude === eventDetail.longitude
            );
            if (rawEvent) {
                drawConnectionLines(rawEvent, color(255, 0, 0, 255)); // 红色
            }
        });
    }
    
    // 3. 绘制选中的单个事件或组的连接线
    if (selectedRawEvent && !clickedGroup) {
        drawConnectionLines(selectedRawEvent, color(255, 100, 0, 255));
    } else if (selectedGroup && !clickedGroup) {
        selectedGroup.events.forEach(eventDetail => {
            const rawEvent = rawData.find(r => 
                r.country === selectedGroup.country && 
                r.year === selectedGroup.year && 
                r.latitude === eventDetail.latitude && 
                r.longitude === eventDetail.longitude
            );
            if (rawEvent) {
                drawConnectionLines(rawEvent, color(255, 100, 0, 255));
            }
        });
    }

    drawMapPoints(); 
    
    // === 修改：显示详细信息面板的逻辑 ===
    if (hoveredRawEvent) {
        renderDetailsPanelDOM(hoveredRawEvent); 
    } else if (clickedGroup) {
        renderDetailsPanelDOM(clickedGroup); 
    } else if (selectedCountry && !selectedRawEvent && !selectedGroup && !clickedGroup) {
        drawCountryDetails(selectedCountry); 
        detailsPanel.style.display = 'none';
    } else if (selectedRawEvent) {
        renderDetailsPanelDOM(selectedRawEvent); 
    } else if (selectedGroup) {
        renderDetailsPanelDOM(selectedGroup); 
    } else {
        detailsPanel.style.display = 'none';
    }
    
    updateLegendStyles();
}

function calculateCoordinates() {
    let minLon = -180;
    let maxLon = 180;
    let minLat = -90;
    let maxLat = 90;
    
    const MAP_PADDING_X = 0; 
    const MAP_PADDING_Y_TOP = MAP_TOP_PADDING; 
    const MAP_PADDING_Y_BOTTOM = 0; 

    rawData.forEach(item => {
        item.mapX = map(item.longitude, minLon, maxLon, MAP_PADDING_X, CANVAS_WIDTH - MAP_PADDING_X);
        item.mapY = map(item.latitude, minLat, maxLat, MAP_BOUNDARY_Y - MAP_PADDING_Y_BOTTOM, MAP_PADDING_Y_TOP); 
    });

    groupedData.forEach(group => {
        group.events.forEach(eventDetail => {
            const rawEvent = rawData.find(r => 
                r.country === group.country && 
                r.year === group.year && 
                r.latitude === eventDetail.latitude && 
                r.longitude === eventDetail.longitude
            );
            if (rawEvent) {
                eventDetail.mapX = rawEvent.mapX;
                eventDetail.mapY = rawEvent.mapY;
            }
        });
    });

    let currentYOffset = {}; 
    const BASE_Y = CANVAS_HEIGHT - TIMELINE_HEIGHT + TIMELINE_Y_OFFSET + 5; 
    
    groupedData.forEach(item => {
        item.timelineX = TIMELINE_START_X + (item.year - START_YEAR) * YEAR_SCALE * 3;
        
        let yearKey = item.year.toString();
        currentYOffset[yearKey] = currentYOffset[yearKey] || 0;
        
        item.timelineY = BASE_Y + currentYOffset[yearKey];
        currentYOffset[yearKey] += LINE_HEIGHT;
    });
}

function drawPolygon(coordinates, mapFnX, mapFnY) {
    for (let i = 0; i < coordinates.length; i++) {
        const ring = coordinates[i]; 
        beginShape();
        for (const coord of ring) {
            const x = mapFnX(coord[0]);
            const y = mapFnY(coord[1]);
            vertex(x, y);
        }
        endShape(CLOSE);
    }
}

function drawWorldMap() {
    if (!worldData || !worldData.features) return;
    noFill();
    stroke(50, 50, 50, 100); 
    strokeWeight(1);       
    const minLon = -180;
    const maxLon = 180;
    const minLat = -90;
    const maxLat = 90;
    const MAP_PADDING_X = 0; 
    const MAP_PADDING_Y_TOP = MAP_TOP_PADDING; 
    const MAP_PADDING_Y_BOTTOM = 0; 

    const mapFnX = (lon) => map(lon, minLon, maxLon, MAP_PADDING_X, CANVAS_WIDTH - MAP_PADDING_X);
    const mapFnY = (lat) => map(lat, minLat, maxLat, MAP_BOUNDARY_Y - MAP_PADDING_Y_BOTTOM, MAP_PADDING_Y_TOP);

    for (const feature of worldData.features) {
        const geometry = feature.geometry;
        if (geometry.type === "Polygon") {
            drawPolygon(geometry.coordinates, mapFnX, mapFnY);
        } else if (geometry.type === "MultiPolygon") {
            for (const polygon of geometry.coordinates) {
                drawPolygon(polygon, mapFnX, mapFnY);
            }
        }
    }
}

function drawMapPoints() {
    for (let item of rawData) {
        let c = P5_COLOR_MAP[item.country] || P5_COLOR_MAP[''];
        
        const isSelectedRawEvent = selectedRawEvent === item;
        const isSelectedGroup = selectedGroup && selectedGroup.country === item.country && selectedGroup.year === item.year;
        const isSelectedCountry = selectedCountry && item.country === selectedCountry;
        const isHovered = hoveredRawEvent === item;
        const isClickedGroup = clickedGroup && clickedGroup.country === item.country && clickedGroup.year === item.year;
        
        let pointAlpha = 255; 
        let pointStroke = false;

        if (isSelectedRawEvent) {
            pointStroke = true;
            stroke(255, 100, 0); strokeWeight(4); 
        } else if (isSelectedGroup || isClickedGroup) {
            pointStroke = true;
            stroke(255, 0, 0, 255); strokeWeight(4); // 点击的时间轴组用红色
        } else if (isSelectedCountry) {
            pointStroke = true;
            stroke(255, 200, 0, 255); strokeWeight(3);
        } else if (isHovered) {
            pointStroke = true;
            stroke(255, 100, 0, 200); strokeWeight(3); // 悬停时的描边
        } else {
             pointStroke = false;
        }

        if (pointStroke) {
            fill(red(c), green(c), blue(c), pointAlpha);
        } else {
            noStroke();
            fill(red(c), green(c), blue(c), pointAlpha);
        }

        let pointSize = (isSelectedCountry || isHovered || isClickedGroup) ? 10 : 8;
        ellipse(item.mapX, item.mapY, pointSize);
    }
}

function drawConnectionLines(eventOrRawEvent, strokeColor) {
    const targetKey = `${eventOrRawEvent.country}-${eventOrRawEvent.year}`;
    const targetDot = document.getElementById(`colored-dot-${targetKey}`); 
    if (!targetDot) return; 

    const timelineContainer = document.getElementById('timeline-container');
    const canvasContainer = document.getElementById('main-canvas-container');
    if (!timelineContainer || !canvasContainer) return; 
    
    const dotRect = targetDot.getBoundingClientRect();
    const canvasRect = canvasContainer.getBoundingClientRect();

    const x1 = eventOrRawEvent.mapX;
    const y1 = eventOrRawEvent.mapY;
    
    const x4 = (dotRect.left + dotRect.width / 2) - canvasRect.left; 
    const y4 = (dotRect.top + dotRect.height / 2) - canvasRect.top; 

    const timelineY = MAP_BOUNDARY_Y; 

    stroke(strokeColor); 
    strokeWeight(2);
    noFill();
    
    const x2 = x1;
    const y2 = timelineY - 20;
    
    const x3 = x4;
    const y3 = timelineY - 10;
    
    const curveEndX = x4;
    const curveEndY = timelineY; 

    bezier(x1, y1, x2, y2, x3, y3, curveEndX, curveEndY);

    const lineStartX = curveEndX;
    const lineStartY = curveEndY;
    const lineEndX = x4;
    const lineEndY = y4;

    line(lineStartX, lineStartY, lineEndX, lineEndY);
}

function setupDomDetailsPanel() {
    detailsPanel = document.createElement('div');
    detailsPanel.id = 'details-panel-dom';
    
    detailsPanel.style.position = 'absolute'; 
    detailsPanel.style.left = `${PANEL_DOM_X}px`;
    detailsPanel.style.top = `${PANEL_DOM_Y}px`; 
    detailsPanel.style.width = `${PANEL_DOM_WIDTH}px`;
    detailsPanel.style.height = `${PANEL_DOM_HEIGHT}px`; 
    
    detailsPanel.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
    detailsPanel.style.border = '2px solid #ff9900'; 
    detailsPanel.style.borderRadius = '8px';
    detailsPanel.style.padding = '10px';
    detailsPanel.style.boxShadow = '2px 2px 5px rgba(0, 0, 0, 0.2)';
    detailsPanel.style.zIndex = '1000';
    detailsPanel.style.display = 'none';
    detailsPanel.style.overflowY = 'scroll'; 
    
    document.getElementById('main-canvas-container').appendChild(detailsPanel);
}

function renderDetailsPanelDOM(data) {
    PANEL_DOM_Y = MAP_BOUNDARY_Y - PANEL_DOM_HEIGHT - PANEL_DOM_Y_OFFSET_FROM_BOTTOM; 
    detailsPanel.style.top = `${PANEL_DOM_Y}px`; 
    detailsPanel.style.display = 'block';
    
    let contentHTML = '';
    
    if (data.events) {
        const group = data;
        contentHTML += `<h3 style="margin-top: 0; margin-bottom: 5px; font-weight: bold; font-size: 14px;">
                            ${group.country} ${group.year}: ${group.count} Tests
                        </h3><hr style="border: 0; border-top: 1px solid #ccc; margin-bottom: 5px;">
                        <div style="display: flex; flex-wrap: wrap; justify-content: space-between;">`;

        const eventListHTML = group.events.map((event, index) => {
            const yieldStr = event.yield.toString().startsWith('<') ? event.yield : nf(float(event.yield), 0, 1);
            
            return `
                <div style="width: 48%; margin-bottom: 10px; border-left: 3px solid #006400; padding-left: 8px;">
                    <p style="margin: 0; font-weight: bold; font-size: 11px; color: #006400;">
                        Region: ${event.region || 'N/A'} (Test ${index + 1})
                    </p>
                    <p style="margin: 0; font-size: 10px; line-height: 1.3;">
                        <span style="font-weight: bold;">Date:</span> ${event.date || 'N/A'}<br>
                        <span style="font-weight: bold;">Yield:</span> ${yieldStr} kt, 
                        <span style="font-weight: bold;">Depth:</span> ${event.depth || 'N/A'}
                    </p>
                </div>
            `;
        }).join('');
        
        contentHTML += eventListHTML;
        contentHTML += `</div>`;
        
    } else {
        const event = data;
        const yieldStr = event.yield_1.toString().startsWith('<') ? event.yield_1 : nf(float(event.yield_1), 0, 1);
        
        contentHTML += `<h3 style="margin-top: 0; margin-bottom: 5px; font-weight: bold; font-size: 14px;">
                            ${event.country} ${event.year}: Single Test Details
                        </h3><hr style="border: 0; border-top: 1px solid #ccc; margin-bottom: 10px;">
                        <div style="border-left: 3px solid #006400; padding-left: 10px;">
                            <p style="margin: 0; font-weight: bold; font-size: 13px; color: #006400;">
                                Region: ${event.region || 'N/A'}
                            </p>
                            <p style="margin: 5px 0 0 0; font-size: 11px; line-height: 1.4;">
                                <span style="font-weight: bold;">Date_DMY:</span> ${event.date_DMY || 'N/A'}<br>
                                <span style="font-weight: bold;">Name:</span> ${event.name || 'N/A'}<br>
                                <span style="font-weight: bold;">Yield_1:</span> ${yieldStr} kt<br>
                                <span style="font-weight: bold;">Depth:</span> ${event.depth || 'N/A'}<br>
                                <span style="font-weight: bold;">Purpose:</span> ${event.purpose || 'N/A'}<br>
                            </p>
                            <p style="margin: 10px 0 0 0; font-size: 9px; color: #888;">
                               Lat/Lon: ${nf(event.latitude, 0, 3)} / ${nf(event.longitude, 0, 3)}
                            </p>
                        </div>`;
    }

    detailsPanel.innerHTML = contentHTML;
}

function drawCountryDetails(countryName) {
    const PANEL_WIDTH = 250; 
    const PANEL_Y = MAP_TOP_PADDING; 
    const PANEL_X = CANVAS_WIDTH - PANEL_WIDTH - 20; 
    const PANEL_HEIGHT = 150;
    
    const countryEvents = rawData.filter(d => d.country === countryName);
    const totalCount = countryEvents.length;
    const firstYear = groupedData.filter(d => d.country === countryName)[0]?.year || START_YEAR;
    const lastYear = groupedData.filter(d => d.country === countryName).pop()?.year || END_YEAR;
    const totalYield = countryEvents.reduce((sum, d) => sum + (float(d.avgYield) || 0), 0);
    const uniqueRegions = [...new Set(countryEvents.map(d => d.region))];

    fill(200, 255, 255); noStroke(); rect(PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, 5); 

    fill(0); 
    textAlign(LEFT, TOP);
    
    textSize(14); 
    let title = `Country Summary: ${countryName}`; 
    text(title, PANEL_X + 10, PANEL_Y + 10, PANEL_WIDTH - 20, 20);
    
    textSize(12);
    let y = PANEL_Y + 40; 
    
    text(`Total Tests: ${totalCount} times`, PANEL_X + 10, y); 
    y += 20;

    text(`Test Period: ${firstYear} - ${lastYear}`, PANEL_X + 10, y); 
    y += 20;
    
    text(`Total Estimated Yield: ${nf(totalYield, 0, 1) || 'N/A'} (kt)`, PANEL_X + 10, y); 
    y += 20;

    textSize(10);
    let regionList = uniqueRegions.slice(0, 3).join(', ');
    if (uniqueRegions.length > 3) regionList += '...';
    text(`Involved Regions: ${regionList}`, PANEL_X + 10, y, PANEL_WIDTH - 20, 30); 
}

// === 修改：地图点悬停检测 ===
function mouseMoved() {
    if (!table || table.getRowCount() === 0) return; 

    // 检测地图点悬停
    let foundHover = false;
    for (let item of rawData) { 
        if (mouseY >= MAP_TOP_PADDING && mouseY <= MAP_BOUNDARY_Y) { 
            if (dist(mouseX, mouseY, item.mapX, item.mapY) < 10) { 
                hoveredRawEvent = item;
                foundHover = true;
                redraw();
                return; 
            }
        }
    }
    
    // 如果没有悬停在地图点上，清除悬停状态
    if (!foundHover && hoveredRawEvent) {
        hoveredRawEvent = null;
        redraw();
    }
}

// === 修改：点击事件 ===
function mouseClicked() {
    // 如果点击地图区域（非时间轴区域），清除所有选择
    if (mouseY < MAP_BOUNDARY_Y) { 
        selectedRawEvent = null; 
        selectedCountry = null; 
        selectedGroup = null; 
        // 不清除 clickedGroup，保持时间轴点击状态
        highlightedYear = 0; 
        highlightDomYear(0); 
        detailsPanel.style.display = 'none'; 
        redraw(); 
    }
}

function renderLegendDom() {
    let legendDiv = document.getElementById('legend-container');
    if (!legendDiv) {
        legendDiv = document.createElement('div');
        legendDiv.id = 'legend-container';
        document.getElementById('main-canvas-container').appendChild(legendDiv);
    }
    
    legendDiv.innerHTML = '<div style="font-weight: bold; margin-bottom: 5px; font-size: 14px; padding-right: 15px;">Country Legend (Click to Select):</div>';
    
    legendDiv.style.position = 'absolute'; 
    legendDiv.style.padding = '5px 10px';
    legendDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    legendDiv.style.border = '1px solid #ccc';
    legendDiv.style.borderRadius = '5px';
    legendDiv.style.zIndex = '1001'; 
    legendDiv.style.left = '10px'; 
    legendDiv.style.top = `${NAV_HEIGHT}px`; 
    
    legendDiv.style.display = 'flex';
    legendDiv.style.alignItems = 'center';
    legendDiv.style.flexWrap = 'wrap'; 
    legendDiv.style.pointerEvents = 'auto'; 

    COUNTRIES_ORDER.forEach(country => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.marginRight = '15px'; 
        item.style.cursor = 'pointer';
        item.id = `legend-${country}`; 
        item.style.pointerEvents = 'auto'; 

        item.addEventListener('click', function(e) {
            e.stopPropagation();
            window.handleLegendClick(country);
        });

        const colorBox = document.createElement('div');
        colorBox.style.width = '12px';
        colorBox.style.height = '12px';
        colorBox.style.borderRadius = '50%';
        colorBox.style.backgroundColor = getCountryColorHex(country);
        colorBox.style.marginRight = '8px';
        item.appendChild(colorBox);

        const label = document.createTextNode(country);
        item.appendChild(label);

        legendDiv.appendChild(item);
    });
}

function updateLegendStyles() {
    const currentSelectedCountry = selectedCountry || 
                                   (selectedRawEvent ? selectedRawEvent.country : null) ||
                                   (selectedGroup ? selectedGroup.country : null) ||
                                   (clickedGroup ? clickedGroup.country : null);
    
    COUNTRIES_ORDER.forEach(country => {
        const item = document.getElementById(`legend-${country}`);
        if (item) {
            if (country === currentSelectedCountry) {
                item.style.fontWeight = 'bold';
                item.style.backgroundColor = '#ffd8b3';
                item.style.border = '1px solid #ff9900';
                item.style.padding = '1px 3px';
                item.style.borderRadius = '4px';
            } else {
                item.style.fontWeight = 'normal';
                item.style.backgroundColor = 'transparent';
                item.style.border = 'none';
                item.style.padding = '0';
            }
        }
    });
}

// === 修改：时间轴标签点击事件 ===
function renderDomTimeline() {
    const timelineEventsDiv = document.getElementById('timeline-events');
    if (!timelineEventsDiv) { 
        console.error("Error: Timeline container with ID 'timeline-events' not found.");
        return; 
    }
    
    timelineEventsDiv.style.position = 'relative'; 
    timelineEventsDiv.innerHTML = '';
    timelineEventsDiv.style.width = `${TIMELINE_TOTAL_WIDTH}px`;

    const timelineLine = document.createElement('div');
    timelineLine.style.position = 'absolute';
    timelineLine.style.top = `${TIMELINE_Y_OFFSET}px`; 
    timelineLine.style.left = '0';
    timelineLine.style.width = '100%';
    timelineLine.style.height = '1px';
    timelineLine.style.backgroundColor = '#999';
    timelineEventsDiv.appendChild(timelineLine);

    for (let year = START_YEAR; year <= END_YEAR; year += 5) {
        let x = TIMELINE_START_X + (year - START_YEAR) * YEAR_SCALE * 3;
        
        const tick = document.createElement('div');
        tick.style.position = 'absolute';
        tick.style.left = `${x}px`;
        tick.style.top = `${TIMELINE_Y_OFFSET - 10}px`;
        tick.style.width = '1px';
        tick.style.height = '10px';
        tick.style.backgroundColor = '#000';
        timelineEventsDiv.appendChild(tick);
        
        const yearLabel = document.createElement('div');
        yearLabel.className = 'event-label year-label';
        yearLabel.style.left = `${x}px`;
        yearLabel.style.top = `${TIMELINE_Y_OFFSET - 30}px`;
        yearLabel.textContent = year;
        yearLabel.style.width = '40px';
        yearLabel.style.transform = 'translateX(-50%)';
        timelineEventsDiv.appendChild(yearLabel);
    }
    
    groupedData.forEach(item => {
        const labelDiv = document.createElement('div');
        labelDiv.className = 'event-label country-label';
        labelDiv.id = `event-${item.country}-${item.year}`;
        
        labelDiv.style.display = 'flex'; 
        labelDiv.style.alignItems = 'center'; 
        labelDiv.style.whiteSpace = 'nowrap';
        labelDiv.style.cursor = 'pointer'; 
        labelDiv.style.pointerEvents = 'auto';
        
        labelDiv.style.left = `${item.timelineX}px`; 
        labelDiv.style.transform = 'translateX(-50%)'; 
        
        const timelineContainerTop = CANVAS_HEIGHT - TIMELINE_HEIGHT;
        const relativeTimelineY = item.timelineY - timelineContainerTop;
        
        labelDiv.style.top = `${relativeTimelineY}px`; 
        
        labelDiv.style.padding = '2px 5px'; 
        labelDiv.style.borderRadius = '3px';
        labelDiv.style.fontSize = '10px';
        labelDiv.style.lineHeight = '12px';
        labelDiv.style.backgroundColor = 'transparent';
        labelDiv.style.zIndex = 1000;

        const content = `${item.country} ${item.year} (${item.count})`; 
        const textNode = document.createTextNode(content);
        labelDiv.appendChild(textNode);
        
        // === 修改：点击事件 ===
        labelDiv.onclick = (e) => {
            e.stopPropagation(); // 防止事件冒泡
            
            // 如果点击的是已经选中的组，则取消选择
            if (clickedGroup === item) {
                clickedGroup = null;
                selectedGroup = null;
            } else {
                // 选择新的组
                clickedGroup = item;
                selectedGroup = item;
                selectedRawEvent = null;
                
                // 更新高亮年份
                highlightedYear = item.year;
                highlightDomYear(highlightedYear);
            }
            
            redraw();
        };

        timelineEventsDiv.appendChild(labelDiv);
        
        const dotSize = 6;
        const blackDot = document.createElement('div');
        blackDot.style.position = 'absolute';
        blackDot.style.width = `${dotSize}px`;
        blackDot.style.height = `${dotSize}px`;
        blackDot.style.backgroundColor = '#000';
        blackDot.style.borderRadius = '50%';
        
        const blackDotY = TIMELINE_Y_OFFSET - (dotSize / 2);
        blackDot.style.top = `${blackDotY}px`; 
        
        blackDot.style.left = `${item.timelineX - (dotSize / 2)}px`;
        timelineEventsDiv.appendChild(blackDot);

        const colorDotSize = 10;
        const colorDot = document.createElement('div');
        colorDot.id = `colored-dot-${item.country}-${item.year}`; 
        colorDot.style.position = 'absolute';
        colorDot.style.width = `${colorDotSize}px`; 
        colorDot.style.height = `${colorDotSize}px`; 
        colorDot.style.borderRadius = '50%';
        colorDot.style.backgroundColor = getCountryColorHex(item.country); 
        
        const colorDotY = relativeTimelineY - (colorDotSize / 2);
        colorDot.style.top = `${colorDotY}px`; 
        colorDot.style.left = `${item.timelineX - (colorDotSize / 2)}px`;
        colorDot.style.zIndex = 1001;
        timelineEventsDiv.appendChild(colorDot);
    });
    
    document.getElementById('timeline-container').onscroll = () => {
        IS_SCROLLING = true;
        
        clearTimeout(scrollingTimer);
        
        updateYearHighlightFromScroll(); 
        if (navSketch) navSketch.redraw();
        
        scrollingTimer = setTimeout(() => {
            IS_SCROLLING = false;
            redraw(); 
        }, SCROLL_DEBOUNCE_TIME);

        redraw();
    };
}

// === 导航栏构造函数保持不变 ===
function navConstructor(n) {
    const NAV_LINE_Y = NAV_HEIGHT - 10;
    
    n.setup = function() {
        if (!table || table.getRowCount() === 0) { n.noLoop(); return; }
        
        n.createCanvas(CANVAS_WIDTH, NAV_HEIGHT); 
        n.textAlign(n.CENTER, n.CENTER);
        n.textSize(10);
        n.noLoop(); 
        
        n.canvas.addEventListener('click', n.handleNavClick);
    };
    
    n.windowResized = function() {
        if (!table || table.getRowCount() === 0) return;
        CANVAS_WIDTH = windowWidth;
        n.resizeCanvas(CANVAS_WIDTH, NAV_HEIGHT); 
        n.redraw();
    };
    
    n.draw = function() {
        if (!table || table.getRowCount() === 0) return; 

        n.background(220); 
        
        const navRange = n.width - 20; 
        const totalYears = END_YEAR - START_YEAR;
        const PIXELS_PER_YEAR_IN_NAV = navRange / totalYears; 
        
        n.stroke(150);
        n.line(10, NAV_LINE_Y, n.width - 10, NAV_LINE_Y);
        
        for (let year = START_YEAR; year <= END_YEAR; year++) { 
            let x = n.map(year, START_YEAR, END_YEAR, 10, n.width - 10);

            if (year === highlightedYear) { 
                n.fill(255, 100, 0); 
                n.stroke(255, 100, 0);
            } else {
                n.fill(0);
                n.stroke(0);
            }
            
            let tickHeight = (year % 5 === 0) ? 5 : 3;
            n.line(x, NAV_LINE_Y - tickHeight, x, NAV_LINE_Y + tickHeight);
            
            if (PIXELS_PER_YEAR_IN_NAV * 3 > 30 || year % 5 === 0) {
                 n.textSize(8);
                 n.text(year, x, NAV_LINE_Y - 12);
            } else if (PIXELS_PER_YEAR_IN_NAV * 3 > 15) {
                 n.textSize(7);
                 n.push();
                 n.translate(x, NAV_LINE_Y - 5); 
                 n.rotate(-n.PI / 4); 
                 n.textAlign(n.LEFT, n.CENTER); 
                 n.text(year, 0, 0); 
                 n.pop();
            }
        }
        
        // === 修改：只有当没有选中国家且 highlightedYear > 0 时才显示滑动块 ===
        if (highlightedYear > 0 && !selectedCountry) {
            const centerYearX = n.map(highlightedYear, START_YEAR, END_YEAR, 10, n.width - 10);
            
            const indicatorW = PIXELS_PER_YEAR_IN_NAV;
            const finalIndicatorX = centerYearX - indicatorW / 2; 

            n.noStroke();
            n.fill(0, 0, 255, 150); 
            n.rect(finalIndicatorX, NAV_LINE_Y - 8, indicatorW, 16, 3);
            
            n.stroke(0, 0, 200);
            n.noFill();
            n.rect(finalIndicatorX, NAV_LINE_Y - 8, indicatorW, 16, 3);
        }
    };
    
    n.handleNavClick = (event) => {
        if (!table || table.getRowCount() === 0) return; 

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
        
        const targetYear = floor(n.map(ratio, 0, 0.9999, START_YEAR, END_YEAR));
        
        if (targetYear !== highlightedYear) {
             highlightedYear = targetYear;
             highlightDomYear(highlightedYear); 
             n.redraw(); 
             redraw(); 
        } else {
             n.redraw();
             redraw();
        }
    };
}

function redraw() {
    if (navSketch) navSketch.redraw();
}