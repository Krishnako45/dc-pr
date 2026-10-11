// ---------- CRC ENGINE ----------
// This is the "brain" of the project: real binary (modulo-2) division.
// No shortcuts, no hardcoded answers — every result is calculated here.

function isBinary(s){ return /^[01]+$/.test(s); }

function escapeHTML(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// TEXT -> BINARY: each character is encoded as UTF-8 bytes, and each byte is written as 8 bits.
// (For normal English letters this is the same as ASCII: 'H' = 72 = 01001000.)
function textToBinary(text){
  const bytes = new TextEncoder().encode(text);
  return Array.from(bytes).map(b => b.toString(2).padStart(8, '0')).join('');
}

// BINARY -> TEXT: the receiver reverses the process, reading 8 bits at a time.
function binaryToText(bits){
  const bytes = [];
  for(let i = 0; i + 8 <= bits.length; i += 8){
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// Small per-character breakdown shown under the message box (for teaching/demo).
function describeChars(text){
  const enc = new TextEncoder();
  return Array.from(text).map(ch => {
    const bin = Array.from(enc.encode(ch)).map(b => b.toString(2).padStart(8, '0')).join(' ');
    const shown = ch === ' ' ? '(space)' : escapeHTML(ch);
    return `<span class="chip"><b>${shown}</b> &rarr; ${ch.codePointAt(0)} &rarr; ${bin}</span>`;
  }).join('');
}

// Performs modulo-2 (XOR) division of bitsStr by polyStr.
// Returns the remainder and a log of every XOR step (for the "show steps" view).
function crcDivide(bitsStr, polyStr){
  const bits = bitsStr.split('').map(Number);
  const poly = polyStr.split('').map(Number);
  const polyLen = poly.length;
  const steps = [];
  for(let i=0; i <= bits.length - polyLen; i++){
    if(bits[i] === 1){
      const before = bits.slice(i, i+polyLen).join('');
      for(let j=0;j<polyLen;j++){ bits[i+j] ^= poly[j]; }
      const after = bits.slice(i, i+polyLen).join('');
      steps.push({pos:i, before, after});
    }
  }
  const remainder = bits.slice(bits.length - (polyLen-1)).join('');
  return { remainder, steps };
}

// SENDER SIDE: appends (generator length - 1) zeros to the data,
// divides by the generator, and attaches the remainder (CRC) to the data.
function calculateCRC(data, gen){
  const padded = data + '0'.repeat(gen.length - 1);
  const { remainder, steps } = crcDivide(padded, gen);
  const frame = data + remainder;
  return { padded, remainder, frame, steps };
}

// Randomly flips exactly one bit in a frame. Position is chosen dynamically,
// never hardcoded, so every run can corrupt a different bit.
function introduceError(frame){
  const idx = Math.floor(Math.random() * frame.length);
  const chars = frame.split('');
  const originalBit = chars[idx];
  const receivedBit = originalBit === '1' ? '0' : '1';
  chars[idx] = receivedBit;
  return { corrupted: chars.join(''), index: idx, originalBit, receivedBit };
}

// RECEIVER SIDE: divides the received frame by the same generator.
// A remainder of all zeros means no error was detected.
function verifyCRC(frame, gen){
  const { remainder } = crcDivide(frame, gen);
  const ok = !remainder.includes('1');
  return { remainder, ok };
}

function validateInput(data, gen){
  if(!data || !isBinary(data)) return 'Data must be binary (only 0s and 1s).';
  if(!gen || !isBinary(gen) || gen.length < 2) return 'Generator must be binary and at least 2 bits.';
  if(gen[0] !== '1') return 'Generator polynomial must start with 1.';
  return null;
}

// ---------- APP STATE ----------
let state = { frame:null, gen:null, received:null, errorIndex:null, originalBit:null, receivedBit:null };

const dataInput = document.getElementById('data');
const genInput = document.getElementById('gen');
const senderErr = document.getElementById('senderErr');
const senderResult = document.getElementById('senderResult');
const channelBody = document.getElementById('channelBody');
const receiverBody = document.getElementById('receiverBody');
const msgInput = document.getElementById('msg');
const convertBox = document.getElementById('convertBox');
const textField = document.getElementById('textField');
const dataLabel = document.getElementById('dataLabel');
let sentMessage = null;   // the original text message (null when using raw binary mode)

function getMode(){ return document.querySelector('input[name="mode"]:checked').value; }

function updateConversion(){
  const isText = getMode() === 'text';
  textField.style.display = isText ? '' : 'none';
  dataInput.readOnly = isText;
  dataLabel.textContent = isText ? 'Binary data (converted from message)' : 'Binary data';
  if(isText){
    dataInput.value = textToBinary(msgInput.value);
    convertBox.innerHTML = describeChars(msgInput.value);
  }
}

function clearOutputs(){
  state = { frame:null, gen:null, received:null, errorIndex:null, originalBit:null, receivedBit:null };
  sentMessage = null;
  clearSenderError();
  senderResult.innerHTML = `<p class="empty" style="margin-top:16px;">Results will appear here after you calculate the CRC.</p>`;
  channelBody.innerHTML = `<p class="empty">Calculate the CRC first, then send the frame through the channel.</p>`;
  receiverBody.innerHTML = `<p class="empty">Waiting for a frame to arrive from the channel.</p>`;
}

function showSenderError(msg){
  senderErr.textContent = msg;
  senderErr.classList.add('show');
}
function clearSenderError(){
  senderErr.textContent = '';
  senderErr.classList.remove('show');
}

function highlightBit(str, idx){
  return str.split('').map((c,i) => i === idx ? `<span class="flip">${c}</span>` : c).join('');
}

// ---------- SENDER UI ----------
document.getElementById('calcBtn').addEventListener('click', () => {
  clearSenderError();
  if(getMode() === 'text'){
    const text = msgInput.value;
    if(!text.trim()){ showSenderError('Please type a message to send.'); return; }
    dataInput.value = textToBinary(text);   // text -> binary happens here
    sentMessage = text;
  } else {
    sentMessage = null;
  }
  const data = dataInput.value.trim();
  const gen = genInput.value.trim();

  const validationError = validateInput(data, gen);
  if(validationError){ showSenderError(validationError); return; }

  const result = calculateCRC(data, gen);
  state.frame = result.frame;
  state.gen = gen;
  state.received = null;
  state.errorIndex = null;
  state.originalBit = null;
  state.receivedBit = null;

  senderResult.innerHTML = `
    <div class="result-grid">
      <div class="result-card crc"><p class="k">CRC remainder</p><p class="v">${result.remainder}</p></div>
      <div class="result-card frame"><p class="k">Transmitted frame</p><p class="v">${result.frame}</p></div>
    </div>
    <button class="steps-toggle" id="stepsToggle">Show calculation steps</button>
    <div class="steps" id="stepsBox">${renderSteps(result)}</div>
  `;
  document.getElementById('stepsToggle').addEventListener('click', (e) => {
    const box = document.getElementById('stepsBox');
    box.classList.toggle('show');
    e.target.textContent = box.classList.contains('show') ? 'Hide calculation steps' : 'Show calculation steps';
  });

  renderChannel();
  renderReceiver();
});

function renderSteps(result){
  let out = `<div>Data + zeros (generator length - 1):  ${result.padded}</div>`;
  out += `<div>Generator:  ${genInput.value.trim()}</div><div> </div>`;
  result.steps.forEach((s, i) => {
    out += `<div>Step ${i+1} — bit at position ${s.pos} is 1, XOR with generator:  <span class="hi">${s.before}</span> -> ${s.after}</div>`;
  });
  out += `<div> </div><div>Final remainder (CRC):  <span class="hi">${result.remainder}</span></div>`;
  out += `<div>Transmitted frame = data + CRC:  ${result.frame}</div>`;
  return out;
}

// ---------- CHANNEL UI ----------
function renderChannel(){
  channelBody.innerHTML = `
    <div class="frame-flow"><span class="box">Sender: ${state.frame}</span><span class="arrow">&rarr;</span><span class="box">Channel</span><span class="arrow">&rarr;</span><span class="box">Receiver</span></div>
    <div class="btn-row">
      <button class="primary" id="sendClean">Send normally</button>
      <button class="danger" id="sendError">Simulate random error</button>
    </div>
    <div id="channelCompare"></div>
  `;
  document.getElementById('sendClean').addEventListener('click', () => sendFrame(false));
  document.getElementById('sendError').addEventListener('click', () => sendFrame(true));
}

// Sends the transmitted frame through the simulated channel, optionally
// corrupting one bit, then automatically hands it to the receiver.
function sendFrame(withError){
  const compareEl = document.getElementById('channelCompare');

  if(withError){
    const { corrupted, index, originalBit, receivedBit } = introduceError(state.frame);
    state.received = corrupted;
    state.errorIndex = index;
    state.originalBit = originalBit;
    state.receivedBit = receivedBit;

    compareEl.innerHTML = `
      <div class="result-grid" style="margin-top:14px;">
        <div class="result-card"><p class="k">Original frame</p><p class="v">${highlightBit(state.frame, index)}</p></div>
        <div class="result-card"><p class="k">Received frame</p><p class="v">${highlightBit(corrupted, index)}</p></div>
      </div>
      <p class="empty" style="margin-top:10px;">Transmission error — bit position ${index}: original bit was ${originalBit}, received bit is ${receivedBit}.</p>
    `;
  } else {
    state.received = state.frame;
    state.errorIndex = null;
    state.originalBit = null;
    state.receivedBit = null;

    compareEl.innerHTML = `
      <div class="result-grid" style="grid-template-columns:1fr; margin-top:14px;">
        <div class="result-card"><p class="k">Received frame</p><p class="v">${state.received}</p></div>
      </div>
      <p class="empty" style="margin-top:10px;">Sent with every bit unchanged.</p>
    `;
  }

  renderReceiver();
}

// ---------- RECEIVER UI (automatic verification, no button) ----------
function renderReceiver(){
  if(state.received === null){
    receiverBody.innerHTML = `<p class="empty">Waiting for a frame to arrive from the channel.</p>`;
    return;
  }
  const { remainder, ok } = verifyCRC(state.received, state.gen);
  const messageResult = buildMessageResult(ok);
  receiverBody.innerHTML = `
    <div class="result-grid">
      <div class="result-card"><p class="k">Received frame</p><p class="v">${highlightBit(state.received, state.errorIndex)}</p></div>
      <div class="result-card"><p class="k">Remainder at receiver</p><p class="v">${remainder}</p></div>
    </div>
    <div class="badge ${ok ? 'ok' : 'err'}"><span class="sq"></span>${ok ? 'NO ERROR DETECTED' : 'ERROR DETECTED'}</div>
    ${messageResult}
  `;
}

// RECEIVER SIDE (text mode): turns the received bits back into a message.
// The CRC bits at the end are removed first. A frame that fails CRC is discarded.
function buildMessageResult(ok){
  if(sentMessage === null) return '';
  const crcLen = state.gen.length - 1;
  const decoded = binaryToText(state.received.slice(0, state.received.length - crcLen));
  if(ok){
    return `<div class="bubble ok"><p class="k">Message delivered to your friend</p><p class="msg">${escapeHTML(decoded)}</p></div>`;
  }
  return `<div class="bubble err"><p class="k">Frame discarded - message not delivered</p><p class="msg">The receiver would ask the sender to retransmit. Without CRC, your friend would have seen: &ldquo;${escapeHTML(decoded)}&rdquo;</p></div>`;
}

// ---------- RESET ----------
function resetSimulation(){
  document.querySelector('input[name="mode"][value="text"]').checked = true;
  msgInput.value = 'Hi';
  genInput.value = '1011';
  sentMessage = null;
  clearSenderError();
  state = { frame:null, gen:null, received:null, errorIndex:null, originalBit:null, receivedBit:null };
  senderResult.innerHTML = `<p class="empty" style="margin-top:16px;">Results will appear here after you calculate the CRC.</p>`;
  channelBody.innerHTML = `<p class="empty">Calculate the CRC first, then send the frame through the channel.</p>`;
  receiverBody.innerHTML = `<p class="empty">Waiting for a frame to arrive from the channel.</p>`;
  updateConversion();
}
document.getElementById('resetBtn').addEventListener('click', resetSimulation);

// ---------- TEXT / BINARY MODE LISTENERS ----------
msgInput.addEventListener('input', () => { clearOutputs(); updateConversion(); });
document.querySelectorAll('input[name="mode"]').forEach(r =>
  r.addEventListener('change', () => { clearOutputs(); updateConversion(); })
);
updateConversion();
