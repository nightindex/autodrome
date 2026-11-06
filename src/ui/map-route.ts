import { course,itinerary } from '../data/course';
import type { Exercise,Vec2 } from '../types';

/** Ordered occurrences distinguish the two visits to the signal junction. */
export function mapRouteLeg(exercise:Exercise,index=0,single=false):Vec2[]{
  const visit=single?itinerary.findIndex(e=>e.id===exercise.id):index;
  let start=0,end=0;
  for(let i=0;i<=visit;i++){
    const goal=itinerary[i].point;let best=Infinity;
    for(let j=start;j<course.route.length;j++){
      const d=Math.hypot(course.route[j].x-goal.x,course.route[j].z-goal.z);
      if(d<best){best=d;end=j;}if(d<.01)break;
    }
    if(i<visit)start=end;
  }
  if(single){
    let best=Infinity,nearest=start;
    for(let j=start;j<=end;j++){const d=Math.hypot(course.route[j].x-exercise.spawn.x,course.route[j].z-exercise.spawn.z);if(d<best){best=d;nearest=j;}}
    start=nearest;
  }
  return course.route.slice(start,end+1);
}
