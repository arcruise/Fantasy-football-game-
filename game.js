const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = 1200; canvas.height = 700;

let keys = {}, game = false, me = 5, clock = 2700;
let ball = {x:600,y:350,vx:0,vy:0};
let team1 = [], team2 = [], score = [0,0];
let blueImg, redImg, ballImg;

// CREATE SPRITES
function loadAssets(){
    blueImg = makePlayer('#0066ff');
    redImg = makePlayer('#ff2222');
    ballImg = makeBall();
}
function makePlayer(color){
    let c = document.createElement('canvas'); c.width=26; c.height=42;
    let x = c.getContext('2d');
    x.fillStyle=color; x.fillRect(3,11,20,18); // jersey
    x.fillStyle='#111'; x.fillRect(3,29,20,8); // shorts
    x.fillStyle='#f1c27d'; x.beginPath(); x.arc(13,5,6,0,7); x.fill(); // head
    x.fillStyle='#000'; x.fillRect(6,37,4,4); x.fillRect(16,37,4,4); // boots
    x.fillStyle='#fff'; x.font='bold 9px Arial'; x.textAlign='center'; x.fillText('10',13,22);
    return c;
}
function makeBall(){
    let c = document.createElement('canvas'); c.width=14; c.height=14;
    let x = c.getContext('2d');
    x.fillStyle='#fff'; x.beginPath(); x.arc(7,7,7,0,7); x.fill();
    x.strokeStyle='#000'; x.stroke();
    return c;
}

// TEAMS
function spawnTeams(){
    team1=[]; team2=[];
    let pos=[[80,350],[170,140],[170,270],[170,400],[170,530],[290,210],[290,350],[290,490],[410,260],[410,440],[530,350]];
    pos.forEach((p,i)=>{
        team1.push({x:p[0],y:p[1],ox:p[0],oy:p[1],team:1,n:i+1});
        team2.push({x:1200-p[0],y:p[1],ox:1200-p[0],oy:p[1],team:2,n:i+1});
    })
}

// PITCH
function drawPitch(){
    ctx.fillStyle='#0d8a0d'; ctx.fillRect(0,0,1200,700);
    ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.strokeRect(0,0,1200,700);
    ctx.beginPath(); ctx.moveTo(600,0); ctx.lineTo(600,700); ctx.stroke();
    ctx.beginPath(); ctx.arc(600,350,80,0,7); ctx.stroke();
    ctx.fillRect(0,240,100,220); ctx.fillRect(1100,240,100,220);
    ctx.fillRect(0,290,50,120); ctx.fillRect(1150,290,50,120);
}

// DRAW
function draw(){
    drawPitch();
    [...team1,...team2].forEach((p,i)=>{
        let img = p.team===1?blueImg:redImg;
        ctx.drawImage(img, p.x-13, p.y-21);
        if(i===me){ctx.strokeStyle='yellow';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y+16,18,0,7);ctx.stroke();}
    });
    ctx.drawImage(ballImg, ball.x-7, ball.y-7);
}

// AI + PHYSICS
function update(){
    team2.forEach(p=>{
        let d = Math.hypot(ball.x-p.x, ball.y-p.y);
        if(d<220){if(p.x<ball.x)p.x+=2.3;if(p.y<ball.y)p.y+=2.3;if(p.x>ball.x)p.x-=2.3;if(p.y>ball.y)p.y-=2.3;}
        else{if(Math.abs(p.x-p.ox)>2)p.x+=p.x<p.ox?1.2:-1.2;if(Math.abs(p.y-p.oy)>2)p.y+=p.y<p.oy?1.2:-1.2;}
    });

    let ply = team1[me];
    let spd = keys['Shift']||keys['sprint']?7:4.5;
    if(keys['w']||keys['up'])ply.y-=spd;
    if(keys['s']||keys['down'])ply.y+=spd;
    if(keys['a']||keys['left'])ply.x-=spd;
    if(keys['d']||keys['right'])ply.x+=spd;
    ply.x = Math.max(20,Math.min(1180,ply.x));
    ply.y = Math.max(20,Math.min(680,ply.y));

    ball.x+=ball.vx; ball.y+=ball.vy; ball.vx*=0.985; ball.vy*=0.985;
    if(ball.x<12&&ball.y>290&&ball.y<410){score[1]++;reset()}
    if(ball.x>1188&&ball.y>290&&ball.y<410){score[0]++;reset()}
}

function reset(){ball={x:600,y:350,vx:0,vy:0};spawnTeams()}

// CONTROLS
function shoot(){let ply=team1[me];ball.x=ply.x+20;ball.y=ply.y;ball.vx=13;ball.vy=0}
function pass(){let ply=team1[me];let tar=team1.filter((_,i)=>i!==me).reduce((a,b)=>Math.hypot(a.x-ply.x,a.y-ply.y)<Math.hypot(b.x-ply.x,b.y-ply.y)?a:b);ball.vx=(tar.x-ply.x)/12;ball.vy=(tar.y-ply.y)/12}

onkeydown=e=>{keys[e.key]=1}
onkeyup=e=>{keys[e.key]=0;if(e.key===' ')shoot();if(e.key==='e')pass();if(e.key==='f'){let ply=team1[me];if(Math.hypot(ball.x-ply.x,ball.y-ply.y)<24){ball.x=ply.x;ball.y=ply.y;ball.vx=ball.vy=0}}}
onkeydown=e=>{if(e.key==='Tab'){e.preventDefault();me=(me+1)%11}}

['up','down','left','right'].forEach(id=>{document.getElementById(id).ontouchstart=()=>keys[id]=1;document.getElementById(id).ontouchend=()=>keys[id]=0});
document.getElementById('shoot').ontouchend=()=>shoot();
document.getElementById('pass').ontouchend=()=>pass();
document.getElementById('sprint').ontouchstart=()=>keys['sprint']=1;document.getElementById('sprint').ontouchend=()=>keys['sprint']=0;

// GAME LOOP
function loop(){
    if(!game) return;
    draw(); update();
    clock--;
    let m=Math.floor(clock/60), s=clock%60;
    document.getElementById('score').innerText=`${score[0]} - ${score[1]}`;
    document.getElementById('timer').innerText=`${m}:${('0'+s).slice(-2)}`;
    requestAnimationFrame(loop);
}

function startGame(){
    loadAssets(); spawnTeams(); game=true;
    document.getElementById('menu').style.display='none';
    canvas.style.display='block';
    document.querySelectorAll('#controls button').forEach(b=>b.style.display='block');
    loop();
}
