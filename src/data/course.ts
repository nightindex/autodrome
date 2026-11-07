import type { CourseDefinition, Exercise, ExerciseId, Vec2 } from '../types';
import { afterHillBRoute,bTurnCourse,cdTurnCourse,perimeterExit,planArc } from './after-hill';
import { intersectionApproaches } from './intersection';
export const mapPoint = (x: number, y: number): Vec2 => ({ x: (x - 640) * 0.1, z: (y - 530) * 0.1 });
export const startLinePoint=mapPoint(232,935);
export const finishLinePoint=mapPoint(145,775);
const p = mapPoint;
const path = (a: number[][]) => a.map(([x, y]) => p(x, y));
const names: Record<ExerciseId, [string, string, string, string]> = {
  start: ['Start', 'Старт', 'Kamarni taqing. Dvigatelni yoqing, 1-uzatma va chap burilish chirog‘ini tanlang.', 'Пристегнитесь. Запустите двигатель, включите первую передачу и левый поворотник.'],
  pedestrian: ['Piyodalar o‘tish joyi', 'Пешеходный переход', 'Stop chizig‘iga 1 metrdan yaqin to‘xtang. 3 soniya kuting.', 'Остановитесь не далее 1 метра от стоп-линии. Подождите 3 секунды.'],
  hill: ['Estakada', 'Эстакада', 'Qiyalikdagi chiziqda to‘xtang. Qo‘l tormozidan foydalanib, orqaga ketmasdan yuring.', 'Остановитесь на подъёме. Троньтесь с ручника без отката.'],
  rightAngle: ['90° burilishlar', 'Повороты на 90°', 'Yo‘nalish bo‘ylab sekin yuring. G‘ildiraklar sariq chiziqdan chiqmasin.', 'Следуйте по поворотам медленно. Не пересекайте жёлтые линии колёсами.'],
  intersection: ['Chorraha', 'Перекрёсток', 'Svetoforga qarang. Qizilda stop chizig‘ini kesmang; yashilda yo‘lni davom ettiring.', 'Следите за светофором. На красный стойте перед линией; на зелёный продолжайте.'],
  snake: ['Ilon izi', 'Змейка', 'Egri yo‘ldan chiziqlarga tegmasdan o‘ting. Vaqt: 2 daqiqa.', 'Пройдите извилистый участок, не касаясь линий. Время: 2 минуты.'],
  garage: ['Boksga kirish', 'Въезд в бокс', 'Boks yonidan o‘ting, R ni tanlang va orqaga kirib to‘xtang. G‘ildiraklarni sariq chiziqqa qo‘ying.', 'Проедьте мимо бокса, включите R, сдайте назад и остановитесь колёсами на жёлтой линии.'],
  railway: ['Temiryo‘l kesishmasi', 'Железнодорожный переезд', 'Stop chizig‘ida to‘xtang va 3 soniya kuting. Keyin relslardan o‘ting.', 'Остановитесь перед стоп-линией на 3 секунды, затем пересеките пути.'],
  acceleration: ['Tezlanish', 'Разгон', 'Ikkinchi uzatmaga o‘ting. Tezlikni 20–40 km/soat orasida saqlang.', 'Включите вторую передачу. Держите скорость в пределах 20–40 км/ч.'],
  emergency: ['Favqulodda to‘xtash', 'Аварийная остановка', 'Signalni kuting. 2 soniyada to‘xtang, 3 soniyada avariya chirog‘ini yoqing.', 'Дождитесь сигнала. Остановитесь за 2 секунды, включите аварийку за 3 секунды.'],
  parallel: ['Parallel parkovka', 'Параллельная парковка', 'Cho‘ntakka orqaga parallel kiring. Belgilangan chiziqda to‘xtang.', 'Сдайте назад в карман параллельно дороге. Остановитесь на контрольной линии.'],
  finish: ['Finish', 'Финиш', 'O‘ng burilish chirog‘ini yoqing. Finishdan o‘ting va to‘xtang.', 'Включите правый поворотник. Пересеките финиш и остановитесь.'],
};
function exercise(id: ExerciseId, x: number, y: number, sx: number, sy: number, yaw: number, extra: Partial<Exercise> = {}): Exercise {
  const [uz, ru, iu, ir] = names[id];
  return { id, name: { uz, ru }, instruction: { uz: iu, ru: ir }, point: p(x, y), spawn: p(sx, sy), yaw, radius: 3.5, ...extra };
}
export const course: CourseDefinition = {
  id: 'uz-category-b-reference', laneWidth: 3.5, hillGradient: 1.8/11, scale: 0.1, verification: 'estimated',
  roads: [
    { points: path([[45,950],[45,240],[80,150],[160,116],[1100,116],[1200,150],[1215,240],...perimeterExit]), width: 7.8, smooth: true },
    { points: path([[45,505],[1100,505],[1150,505],[1215,430]]), width: 7.8, smooth: true },
    { points: path([[635,935],[635,210],[650,116]]), width: 8, smooth: false },
    { points: path([[635,775],[145,775],[65,840],[45,935]]), width: 7.8, smooth: false },
    { points: path(bTurnCourse), width: 4.5, smooth: false },
    { points: path([[1160,505],[1180,430],[1120,320],[1030,275],[930,300],[850,265],[850,190],[795,175],[760,230],[765,345],[820,390],[890,365],[955,400],[955,445],[900,470],[730,470],[700,420],[700,240],[735,175],[820,160],[1100,160],[1180,205],[1190,325]]), width: 4.8, smooth: true },
    { points: path([[635,470],[500,470],[500,240],[500,310],[545,310]]), width: 4.8, smooth: false },
    { points: path([[520,470],[420,470],[420,220],[370,220],[370,300],[325,300]]), width: 4.8, smooth: false },
    { points: path([[420,470],[275,470],[275,200],[230,140],[175,140],[145,200],[145,280],[205,280]]), width: 4.8, smooth: false },
    { points: path([[145,280],[145,415],[180,445],[205,420],[205,300]]), width: 4.8, smooth: true },
    { points: path([[70,570],[460,570],[510,540],[570,560],[600,610],[600,680],[555,720],[380,720]]), width: 5.2, smooth: true },
  ],
  exercises: [
    exercise('start',320,950,200,950,Math.PI/2,{radius:2}),
    exercise('pedestrian',510,950,420,950,Math.PI/2,{stop:{point:p(462,950),normal:{x:1,z:0}}}),
    exercise('hill',850,950,620,950,Math.PI/2,{stop:{point:p(770,950),normal:{x:1,z:0}}}),
    exercise('rightAngle',715,745,1235,805,Math.PI,{timeLimit:120,indicator:'right'}),
    exercise('intersection',655,410,655,650,Math.PI,{stop:{point:{...intersectionApproaches[0].stop,x:1.5},normal:intersectionApproaches[0].normal,light:true}}),
    exercise('snake',950,445,760,205,0,{timeLimit:120}),
    exercise('garage',175,275,205,380,Math.PI,{parking:{center:p(175,275),yaw:Math.PI/2,width:3.3,length:6},radius:2}),
    exercise('railway',1235,255,1235,410,Math.PI,{stop:{point:p(1235,315),normal:{x:0,z:-1}}}),
    exercise('acceleration',600,100,1015,100,-Math.PI/2,{radius:4}),
    exercise('emergency',45,410,45,220,0,{radius:4}),
    exercise('parallel',390,600,275,561,Math.PI/2,{parking:{center:p(390,600),yaw:Math.PI/2,width:3.1,length:6.5},radius:2}),
    exercise('finish',145,795,520,795,-Math.PI/2,{indicator:'right',radius:3}),
  ],
  route: path([
    [200,950],[320,950],[475,950],[510,950],[660,950],[770,950],[850,950],...afterHillBRoute,
    [655,550],[655,410],[655,200],[655,140],[730,140],[760,165],[760,200],[760,230],[760,340],[785,390],[820,405],[855,395],[890,362],[920,370],[955,400],[960,425],[950,445],
    [960,470],[900,490],[635,490],[265,490],[205,440],[205,380],[205,225],[205,275],[175,275],
    [205,275],[205,400],[215,465],[265,490],[545,490],[545,525],[700,525],[1165,525],[1235,450],[1235,410],[1235,315],[1235,255],
    [1200,150],[1100,100],[1015,100],[600,100],[200,100],[80,150],[45,240],[45,410],[45,505],
    [100,561],[445,561],[425,575],[420,600],[390,600],[410,590],[425,570],[445,561],[490,561],[520,530],[540,530],
    ...planArc(540,610,80,-90,0).slice(1),[620,680],...planArc(545,680,75,0,90).slice(1),[520,795],[145,795],
  ]),
};
course.roads.push({points:path(cdTurnCourse),width:5.2,smooth:false});
// Explicit connector roads keep the driven B route connected at exercise transitions.
course.roads.push({points:path([[780,745],[635,745]]),width:5,smooth:false});
course.roads.push({points:path([[545,240],[545,470]]),width:4.8,smooth:false});
course.roads.push({points:path([[635,200],[700,175],[760,200],[760,230]]),width:4.8,smooth:false});
course.roads.push({points:path([[635,470],[730,470]]),width:5,smooth:false});
course.roads.push({points:path([[475,570],[570,560]]),width:4.8,smooth:false});
// Parking pockets extend into the grass inset in the plan, beyond the through lane.
for(const [left,right]of [[70,160],[215,305],[350,440]])course.roads.push({points:path([[left,600],[right,600]]),width:3,smooth:false});
export const hillBounds={minZ:36,maxZ:45.5};
export const hillProfile={start:2,crestStart:13,crestEnd:22,end:33,height:1.8,deckMinZ:36.6,deckMaxZ:44.4};
export function hillHeight(x: number, z: number): number {
  if (z < hillBounds.minZ || z > hillBounds.maxZ) return 0;
  const {start,end,crestStart:plateauStart,crestEnd:plateauEnd}=hillProfile;
  if (x <= start || x >= end) return 0;
  return Math.min(x-start, end-x, plateauStart-start, end-plateauEnd) * course.hillGradient;
}
export const itinerary:Exercise[]=[...course.exercises.slice(0,7),
  exercise('intersection',700,525,495,525,Math.PI/2,{stop:{point:{...intersectionApproaches[2].stop,z:-.5},normal:intersectionApproaches[2].normal,light:true}}),
  ...course.exercises.slice(7)];
