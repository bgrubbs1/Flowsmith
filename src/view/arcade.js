// Same campaign, selectable from a desktop companion. All records stay local.
export function mountArcade(app, renderer, sound) {
  const bar = document.createElement('nav'); bar.id = 'arcade-bar';
  bar.innerHTML = `<strong>FLOWSMITH <small>THE WATERWORKS</small></strong><div><button data-action="arcade">Puzzles & records</button><button data-action="resume">Resume puzzle</button><button data-action="daily">Daily flow</button><button data-action="hint">Hint</button><button data-action="reset">Restart</button><button data-action="next">Next puzzle →</button></div>`;
  document.body.appendChild(bar);
  const panel = document.createElement('dialog'); panel.id = 'arcade';
  panel.innerHTML = `<header><div><small>TWELVE PUZZLES. ONE FLOW STATE.</small><h2>Choose your waterworks.</h2><p>Connect the pipes. Balance the valves. Light the valley.</p></div><button id="close-arcade">Close ×</button></header><div id="arcade-grid"></div><footer><strong>Personal bests · this browser only</strong><p>Score = 1,000 per star + 10 per accuracy point. Time breaks ties. No global leaderboard.</p></footer>`;
  document.body.appendChild(panel);
  const status = document.createElement('div'); status.id = 'desktop-status'; status.setAttribute('aria-live','polite'); document.body.appendChild(status);
  function open() {
    sound.start();
    const grid = panel.querySelector('#arcade-grid'); grid.replaceChildren();
    app.levels.forEach((level,i) => {
      const b=document.createElement('button'); b.className='puzzle-card';
      const stars=app.progress.stars[level.id]||0, record=app.progress.records?.[level.id];
      b.innerHTML=`<small>${String(i+1).padStart(2,'0')} / ${i<3?'LEARN':i<7?'BUILD':'MASTER'} <span>${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</span></small><strong>${level.name}</strong><span>${level.rows} × ${level.cols} board</span><em>${record?record.score.toLocaleString()+' pts'+(record.clock === 'wall' ? ' · '+record.seconds+'s' : ''):'Set your first record'}</em>`;
      b.addEventListener('click',()=>{panel.close();document.body.classList.add('playing');app.startLevel(i);}); grid.appendChild(b);
    });
    if(!panel.open)panel.showModal();
  }
  panel.querySelector('#close-arcade').addEventListener('click',()=>panel.close());
  bar.addEventListener('click',e=>{const a=e.target.closest('button')?.dataset.action;if(!a)return;if(a==='arcade')return open();document.body.classList.add('playing');sound.start();app.onButton(a);});
  document.getElementById('browse-puzzles')?.addEventListener('click',open);
  const refresh=()=>{const play=app.mode==='play';bar.querySelector('[data-action="resume"]').hidden=play||!app.st;for(const a of ['hint','reset'])bar.querySelector(`[data-action="${a}"]`).disabled=!play;bar.querySelector('[data-action="next"]').disabled=!play||!app.solved;status.textContent=play?(app.solved&&!app.st.result.solved?`FLOW INTERRUPTED / earned stars saved / repair or continue`:app.solved?`FLOW RESTORED · ${app.solvedStars}/3 stars · saved on this browser`:`${app.def.name} · Hold a pipe + scroll/R to turn · Hold a red valve + scroll to tune`):'Choose a puzzle above, or click a numbered puck.';};
  app.onEvent(refresh);refresh();
  renderer.xr.addEventListener('sessionstart',()=>{document.body.classList.add('in-xr');panel.close();});
  renderer.xr.addEventListener('sessionend',()=>document.body.classList.remove('in-xr'));
}
