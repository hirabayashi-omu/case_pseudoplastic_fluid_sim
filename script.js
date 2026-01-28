/**
 * Pseudoplastic Fluid Molecular Simulation
 * 
 * Logic:
 * - Polymers are chains of constrained particles (Nodes).
 * - Constraints:
 *   1. Distance constraint (segments have fixed length).
 *   2. Angular constraint (angle > 90 degrees).
 * - Forces:
 *   1. Brownian motion (Random thermal noise).
 *   2. Shear Flow (Velocity gradient y * shearRate).
 * 
 * Visuals:
 * - High shear -> Alignment, stretching.
 * - Low shear -> Coiling, random orientation.
 */

// Configuration
const CONFIG = {
    segmentCount: 50,  // Number of segments per polymer
    segmentLength: 5,   // Length of each link
    polymerCount: 100,    // Initial number of polymers
    k_stiffness: 0.5,   // Spring constant for distance constraint
    friction: 0.9,      // Damping
    brownianForce: 0.3, // Magnitude of random kicks
    shearInfluence: 0.1, // How strongly the fluid pulls the nodes
    angularConstraintIterations: 10, // Iterations to solve constraints (Increased to ensure constant length)
    minAngleDeg: 90
};

// State
let state = {
    shearRate: 0, // 0 to 100 effectively
    polymers: []
};

// Global time for animation
let time = 0;

// Canvas Setup
// Canvas Setup
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');
let width, height;

const chartCanvas = document.getElementById('flowCurveCanvas');
const chartCtx = chartCanvas.getContext('2d');
let chartWidth, chartHeight;

function resize() {
    // Sim View
    const container = document.querySelector('.sim-view');
    width = canvas.width = container.clientWidth;
    height = canvas.height = container.clientHeight;

    // Chart View
    const chartContainer = document.querySelector('.chart-view');
    chartWidth = chartCanvas.width = chartContainer.clientWidth;
    chartHeight = chartCanvas.height = chartContainer.clientHeight;
}
window.addEventListener('resize', resize);
resize();


// Chart Drawing Logic (Power-Law Model)
// tau = K * (gamma_dot)^n
// n < 1 for pseudoplastic (shear-thinning)
const CHART_CONFIG = {
    n: 0.5, // Power index
    maxShear: 100,
    maxStress: 10 // Arbitrary scale for visualization
};

function drawChart() {
    chartCtx.clearRect(0, 0, chartWidth, chartHeight);

    // Calculate dynamic rheological parameters (Power-Law Model)

    // Normalize inputs
    const lenRatio = CONFIG.segmentCount / 300;
    const countRatio = state.polymers.length / 500;

    // Power index 'n':
    // User requested simpler model with smaller exponent (stronger shear thinning)
    // Increased coefficients to drive n lower.
    let n = 1.0 - (lenRatio * 0.7 + countRatio * 0.3);
    if (n < 0.15) n = 0.15; // Allow it to go quite low

    // Consistency index 'K':
    let K = 0.2 + (lenRatio * 8.0 + countRatio * 4.0);

    // Calculate max stress at max shear to auto-scale Y
    // Model: Stress = K * s^n
    const maxStressSim = K * Math.pow(CHART_CONFIG.maxShear, n);
    let yAxisMax = Math.ceil(maxStressSim * 1.2);
    if (yAxisMax < 10) yAxisMax = 10;

    // Margins
    const padLeft = 60;
    const padBottom = 40;
    const padTop = 60;
    const padRight = 30;
    const graphW = chartWidth - padLeft - padRight;
    const graphH = chartHeight - padBottom - padTop;

    // --- Axes ---
    chartCtx.beginPath();
    chartCtx.strokeStyle = '#8b949e';
    chartCtx.lineWidth = 1;

    // Y-Axis
    chartCtx.moveTo(padLeft, padTop);
    chartCtx.lineTo(padLeft, chartHeight - padBottom);

    // X-Axis
    chartCtx.lineTo(chartWidth - padRight, chartHeight - padBottom);
    chartCtx.stroke();

    // Labels & Ticks
    chartCtx.fillStyle = '#8b949e';
    chartCtx.font = '12px Inter';
    chartCtx.textAlign = 'center';

    // X
    chartCtx.fillText("Shear Rate (1/s)", chartWidth / 2 + padLeft / 2, chartHeight - 10);
    chartCtx.fillText("100", chartWidth - padRight, chartHeight - 20);

    // Y Label
    chartCtx.save();
    chartCtx.translate(20, chartHeight / 2);
    chartCtx.rotate(-Math.PI / 2);
    chartCtx.textAlign = 'center';
    chartCtx.fillText("Shear Stress (τ)", 0, 0);
    chartCtx.restore();

    // Y Ticks
    chartCtx.textAlign = 'right';
    chartCtx.fillText(yAxisMax.toFixed(0), padLeft - 10, padTop + 5);
    chartCtx.fillText("0", padLeft - 10, chartHeight - padBottom);

    // --- Power Law Curve ---
    chartCtx.beginPath();
    chartCtx.strokeStyle = '#58a6ff';
    chartCtx.lineWidth = 2;

    for (let s = 0; s <= CHART_CONFIG.maxShear; s += 2) {
        const stress = K * Math.pow(s, n);

        const px = padLeft + (s / CHART_CONFIG.maxShear) * graphW;
        const normalizedStress = Math.min(stress / yAxisMax, 1.1);
        const py = (chartHeight - padBottom) - normalizedStress * graphH;

        if (s === 0) chartCtx.moveTo(px, py);
        else chartCtx.lineTo(px, py);
    }
    chartCtx.stroke();

    // --- Current State Dot ---
    const currentRate = state.shearRate;
    const currentStress = K * Math.pow(currentRate, n);

    const cx = padLeft + (currentRate / CHART_CONFIG.maxShear) * graphW;
    const cy = (chartHeight - padBottom) - Math.min(currentStress / yAxisMax, 1.1) * graphH;

    // Dot
    chartCtx.beginPath();
    chartCtx.fillStyle = '#ff0055';
    chartCtx.arc(cx, cy, 6, 0, Math.PI * 2);
    chartCtx.fill();

    // Drop lines
    chartCtx.beginPath();
    chartCtx.strokeStyle = 'rgba(255, 0, 85, 0.3)';
    chartCtx.setLineDash([5, 5]);
    chartCtx.moveTo(cx, cy);
    chartCtx.lineTo(cx, chartHeight - padBottom);
    chartCtx.moveTo(cx, cy);
    chartCtx.lineTo(padLeft, cy);
    chartCtx.stroke();
    chartCtx.setLineDash([]);

    // Viscosity Slope Line
    chartCtx.beginPath();
    chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    chartCtx.lineWidth = 2;
    chartCtx.moveTo(padLeft, chartHeight - padBottom);
    chartCtx.lineTo(cx, cy);
    chartCtx.stroke();

    // --- Apparent Viscosity Display ---
    let eta = 0;
    if (currentRate > 0.01) {
        eta = (currentStress / currentRate) * 1000;
    } else {
        // For Power Law, zero shear viscosity is infinite if n < 1
        // Show a large number as best guess for "at rest"
        eta = (K * Math.pow(0.01, n) / 0.01) * 1000;
    }

    chartCtx.fillStyle = '#ff0055';
    chartCtx.textAlign = 'left';
    chartCtx.font = '12px Inter';
    chartCtx.fillText(`η = ${eta.toFixed(0)} mPa·s`, cx + 10, cy - 10);

    // --- Info Display ---
    chartCtx.fillStyle = '#e6edf3';
    chartCtx.textAlign = 'left';
    chartCtx.font = '14px Noto Sans JP';

    chartCtx.fillText(`流動指数 n = ${n.toFixed(2)}`, padLeft + 20, 30);
    chartCtx.fillText(`コンシステンシ係数 K = ${K.toFixed(2)}`, padLeft + 160, 30);
}

// --- Physics Classes ---

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.oldX = x;
        this.oldY = y; // For Verlet integration
        this.vx = 0;
        this.vy = 0;
        this.mass = 1;
    }

    update() {
        // Simple Verlet-ish integration with explicit velocity tracking for flow interaction
        this.x += this.vx;
        this.y += this.vy;
    }

    applyForce(fx, fy) {
        this.vx += fx / this.mass;
        this.vy += fy / this.mass;
    }
}

class Polymer {
    constructor(x, y, color) {
        this.nodes = [];
        this.color = color;

        // Initialize nodes in a somewhat random coil
        let currentX = x;
        let currentY = y;
        for (let i = 0; i < CONFIG.segmentCount; i++) {
            this.nodes.push(new Particle(currentX, currentY));
            // Random walk initialization
            const angle = Math.random() * Math.PI * 2;
            currentX += Math.cos(angle) * CONFIG.segmentLength;
            currentY += Math.sin(angle) * CONFIG.segmentLength;
        }
    }

    update() {
        const { shearRate } = state;

        // Turbulence parameters
        // shearRate 0-100 controls turbulence intensity
        const intensity = shearRate * 0.15; // Boosted turbulence
        const driftSpeed = 0.5; // Revert shallow drift, focus on turbulence speed

        // Scale for noise frequency
        const scale = 0.005;

        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];

            // 1. Brownian Motion
            const angle = Math.random() * Math.PI * 2;
            const mag = CONFIG.brownianForce * (Math.random() - 0.5);
            node.vx += Math.cos(angle) * mag;
            node.vy += Math.sin(angle) * mag;

            // 2. Turbulent Flow Field + Laminar Shear Alignment
            // Pseudo-random turbulence
            const turbVx = intensity * (
                Math.sin(node.y * scale + time) +
                Math.cos(node.x * scale * 0.5 + time * 0.7)
            );

            // Laminar Shear Force (Velocity Gradient)
            // Reduced alignment force to keep it chaotic ("Turbulent")
            const shearTerm = (state.shearRate / 100) * (node.y - height / 2) * 0.05;

            const flowVx = driftSpeed + turbVx + shearTerm;

            const flowVy = intensity * (
                Math.sin(node.x * scale - time * 0.5) +
                Math.cos(node.y * scale * 0.5 + time)
            );

            // Drag force (Fluid interaction)
            node.vx += (flowVx - node.vx) * CONFIG.shearInfluence;
            node.vy += (flowVy - node.vy) * CONFIG.shearInfluence;


            // Damping
            node.vx *= CONFIG.friction;
            node.vy *= CONFIG.friction;

            node.update();
        }

        // Wrap logic for centroid
        const centroid = this.getCentroid();
        const margin = 200;
        if (centroid.x > width + margin) this.shift(-(width + margin * 2), 0);
        else if (centroid.x < -margin) this.shift(width + margin * 2, 0);

        if (centroid.y > height + margin) this.shift(0, -(height + margin * 2));
        else if (centroid.y < -margin) this.shift(0, height + margin * 2);


        // 3. Constraints Solver
        for (let k = 0; k < CONFIG.angularConstraintIterations; k++) {
            this.resolveDistanceConstraints();
            this.resolveAngularConstraints();
        }
    }

    getCentroid() {
        let cx = 0, cy = 0;
        for (let n of this.nodes) { cx += n.x; cy += n.y; }
        return { x: cx / this.nodes.length, y: cy / this.nodes.length };
    }

    shift(dx, dy) {
        for (let n of this.nodes) {
            n.x += dx; n.y += dy;
            n.oldX += dx; n.oldY += dy;
        }
    }

    resolveDistanceConstraints() {
        for (let i = 0; i < this.nodes.length - 1; i++) {
            const n1 = this.nodes[i];
            const n2 = this.nodes[i + 1];

            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist === 0) continue;

            const diff = dist - CONFIG.segmentLength;
            const correction = diff / dist * 0.5;

            const offX = dx * correction;
            const offY = dy * correction;

            n1.x += offX;
            n1.y += offY;
            n2.x -= offX;
            n2.y -= offY;
        }
    }

    resolveAngularConstraints() {
        const minAngleCos = Math.cos(CONFIG.minAngleDeg * Math.PI / 180);

        for (let i = 1; i < this.nodes.length - 1; i++) {
            const prev = this.nodes[i - 1];
            const curr = this.nodes[i];
            const next = this.nodes[i + 1];

            let ax = prev.x - curr.x;
            let ay = prev.y - curr.y;
            const aLen = Math.sqrt(ax * ax + ay * ay);

            let bx = next.x - curr.x;
            let by = next.y - curr.y;
            const bLen = Math.sqrt(bx * bx + by * by);

            if (aLen < 0.001 || bLen < 0.001) continue;

            const uax = ax / aLen;
            const uay = ay / aLen;
            const ubx = bx / bLen;
            const uby = by / bLen;

            const dot = uax * ubx + uay * uby;

            if (dot > minAngleCos) {
                const pnx = next.x - prev.x;
                const pny = next.y - prev.y;
                const pnLen = Math.sqrt(pnx * pnx + pny * pny);

                if (pnLen > 0) {
                    const pushFactor = 0.05 * (dot - minAngleCos);

                    const pushX = (pnx / pnLen) * pushFactor * CONFIG.segmentLength;
                    const pushY = (pny / pnLen) * pushFactor * CONFIG.segmentLength;

                    prev.x -= pushX;
                    prev.y -= pushY;
                    next.x += pushX;
                    next.y += pushY;
                }
            }
        }
    }

    draw(ctx) {
        if (this.nodes.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(this.nodes[0].x, this.nodes[0].y);
        for (let i = 1; i < this.nodes.length - 1; i++) {
            const xc = (this.nodes[i].x + this.nodes[i + 1].x) / 2;
            const yc = (this.nodes[i].y + this.nodes[i + 1].y) / 2;
            ctx.quadraticCurveTo(this.nodes[i].x, this.nodes[i].y, xc, yc);
        }
        const last = this.nodes[this.nodes.length - 1];
        ctx.lineTo(last.x, last.y);

        ctx.strokeStyle = this.color;

        // Visual enhancement: glow removed as requested
        ctx.lineWidth = 2;

        ctx.stroke();
    }
}

// --- Main Logic ---

function initPolymers() {
    state.polymers = [];
    const colors = ['#ff0055', '#3366ff']; // Red and Blue

    // Create cluster centers (e.g., 50 clusters)
    const clusterCount = 50;
    const clusters = [];
    for (let k = 0; k < clusterCount; k++) {
        clusters.push({
            x: width * 0.15 + Math.random() * width * 0.7,
            y: height * 0.2 + Math.random() * height * 0.6
        });
    }

    for (let i = 0; i < CONFIG.polymerCount; i++) {
        // Distribute among clusters
        const cluster = clusters[i % clusterCount];

        // Random placement around the cluster center (radius ~100px)
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 80;

        const x = cluster.x + Math.cos(angle) * dist;
        const y = cluster.y + Math.sin(angle) * dist;

        const color = colors[i % colors.length];
        state.polymers.push(new Polymer(x, y, color));
    }
}

// Auto Play State
let isAutoPlaying = false;
const autoPlayBtn = document.getElementById('autoPlayBtn');

if (autoPlayBtn) {
    autoPlayBtn.addEventListener('click', () => {
        isAutoPlaying = !isAutoPlaying;
        autoPlayBtn.textContent = isAutoPlaying ? "ストップ (Stop)" : "自動デモ開始 (Auto)";
        if (isAutoPlaying && state.shearRate >= 100) {
            state.shearRate = 0; // Restart if at end
        }
    });
}

// Recording Logic
const recordBtn = document.getElementById('recordBtn');
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

if (recordBtn) {
    recordBtn.addEventListener('click', () => {
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    });
}

// Global recording variables
let recordingCanvas, recordingCtx;

function startRecording() {
    recordedChunks = [];

    // Create an offscreen canvas to combine both views
    recordingCanvas = document.createElement('canvas');
    recordingCanvas.width = canvas.width;
    recordingCanvas.height = canvas.height + flowCurveCanvas.height;
    recordingCtx = recordingCanvas.getContext('2d');

    // Capture stream from the combined canvas
    const stream = recordingCanvas.captureStream(30); // 30 FPS

    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
    }

    try {
        mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
        console.error("Exception while creating MediaRecorder:", e);
        return;
    }

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, {
            type: 'video/webm'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style = 'display: none';
        a.href = url;
        a.download = 'fluid_simulation_recording.mp4';
        a.click();
        window.URL.revokeObjectURL(url);
    };

    mediaRecorder.start();
    isRecording = true;
    recordBtn.textContent = "録画停止 (Stop & Save)";
    recordBtn.style.backgroundColor = "#ff9900";
}

function stopRecording() {
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.textContent = "録画開始 (Rec)";
    recordBtn.style.backgroundColor = "#e63946";
}

function loop() {
    time += 0.1;

    // Auto Play Logic
    if (isAutoPlaying) {
        state.shearRate += 0.2;
        if (state.shearRate >= 100) {
            state.shearRate = 100;
            isAutoPlaying = false;
            autoPlayBtn.textContent = "自動デモ完了 -> リセット";

            // Wait a moment then reset
            setTimeout(() => {
                state.shearRate = 0;
                initPolymers(); // Regenerate and Reset
                shearSlider.value = 0;
                shearValDisplay.textContent = "0";
                autoPlayBtn.textContent = "自動デモ開始 (Auto)";
                updateStatus();
            }, 1000);
        }
        // Sync UI during play
        shearSlider.value = state.shearRate;
        shearValDisplay.textContent = Math.floor(state.shearRate);
        updateStatus();
    }

    // Clear without trails (opaque)
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, width, height);

    // Update & Draw
    for (let p of state.polymers) {
        p.update();
        p.draw(ctx);
    }

    // Visualize Turbulent Field (Vector Grid)
    if (state.shearRate > 5) {
        drawTurbulenceField();
    }

    // Draw Flow Curve Chart
    drawChart();

    // If recording, compose the frames
    if (isRecording && recordingCtx) {
        // Fill background
        recordingCtx.fillStyle = '#0d1117';
        recordingCtx.fillRect(0, 0, recordingCanvas.width, recordingCanvas.height);

        // Draw Sim
        recordingCtx.drawImage(canvas, 0, 0);

        // Draw Chart below
        recordingCtx.drawImage(flowCurveCanvas, 0, canvas.height);
    }

    requestAnimationFrame(loop);
}

function drawTurbulenceField() {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(255, 255, 255, 0.05)`;
    ctx.lineWidth = 1;

    // Grid sampling
    const step = 40;
    const intensity = state.shearRate * 0.03;
    const driftSpeed = 0.5;
    const scale = 0.005;

    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const vx = driftSpeed + intensity * (
                Math.sin(y * scale + time) +
                Math.cos(x * scale * 0.5 + time * 0.7)
            );
            const vy = intensity * (
                Math.sin(x * scale - time * 0.5) +
                Math.cos(y * scale * 0.5 + time)
            );

            // Draw small vector
            ctx.moveTo(x, y);
            ctx.lineTo(x + vx * 10, y + vy * 10);
        }
    }
    ctx.stroke();
}

// --- UI Binding ---

const shearSlider = document.getElementById('shearRateSlider');
const shearValDisplay = document.getElementById('shearRateValue');
const stateIndicator = document.getElementById('stateIndicator');
const viscosityValue = document.getElementById('viscosityValue');

const countSlider = document.getElementById('polymerCountSlider');
const countValDisplay = document.getElementById('polymerCountValue');
const resetBtn = document.getElementById('resetBtn');

shearSlider.addEventListener('input', (e) => {
    state.shearRate = parseFloat(e.target.value);
    shearValDisplay.textContent = state.shearRate;
    updateStatus();
});

countSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    countValDisplay.textContent = val;
    // Debounce or just wait for reset?
    // Let's update config but not force reset immediately unless requested, 
    // but usually user expects immediate feedback.
    if (Math.abs(CONFIG.polymerCount - val) > 0) {
        CONFIG.polymerCount = val;
        // Adjust array size
        if (val > state.polymers.length) {
            // Add
            const needed = val - state.polymers.length;
            const colors = ['#00f2ff', '#00ff9d', '#ff0055', '#ffe600', '#bd00ff'];
            for (let k = 0; k < needed; k++) {
                state.polymers.push(new Polymer(
                    Math.random() * width,
                    Math.random() * height,
                    colors[state.polymers.length % colors.length]
                ));
            }
        } else {
            // Remove
            state.polymers.splice(val);
        }
    }
});

const lengthSlider = document.getElementById('polymerLengthSlider');
const lengthValDisplay = document.getElementById('polymerLengthValue');

if (lengthSlider) {
    lengthSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        lengthValDisplay.textContent = val;

        if (CONFIG.segmentCount !== val) {
            CONFIG.segmentCount = val;
            initPolymers(); // Re-init to apply new length
        }
    });
}

resetBtn.addEventListener('click', () => {
    initPolymers();
});

function updateStatus() {
    const r = state.shearRate;
    let text = "静止・絡み合い";
    let visc = "High";

    if (r > 80) {
        text = "完全配向・低抵抗 (Shear Thinning)";
        visc = "Low";
    } else if (r > 40) {
        text = "配向進行中・粘度低下";
        visc = "Medium";
    } else if (r > 10) {
        text = "徐々にほぐれ始める";
        visc = "High-Medium";
    }

    stateIndicator.textContent = text;
    viscosityValue.textContent = visc;

    // Adjust global parameters based on shear
    // High shear -> Less random noise (relative to flow)
    // Actually we keep brownian constant, but flow force scales up.
}

// Start
initPolymers();
loop();
