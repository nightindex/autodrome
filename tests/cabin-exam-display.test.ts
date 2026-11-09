import {describe,expect,it} from 'vitest';
import {examDisplayContent,formatExamDisplayTime,type CabinExamDisplayState} from '../src/render/cabin-exam-display';

const state:CabinExamDisplayState={language:'ru',mode:'practice',status:'idle',elapsed:0,score:0,exerciseName:'',events:[]};

describe('the fitted cabin examination monitor',()=>{
  it('shows preparation rather than a copied candidate or successful result before driving',()=>{
    const content=examDisplayContent(state);
    expect(content.status).toBe('Готов к поездке');
    expect(content.exercise).toBe('Выберите упражнение');
    expect(content.empty).toBe('Поездка ещё не начата');
    expect(content.time).toBe('00:00');
  });
  it('distinguishes practice completion from an examination pass in both languages',()=>{
    for(const language of ['ru','uz']as const){
      const practice=examDisplayContent({...state,language,status:'passed'});
      const exam=examDisplayContent({...state,language,status:'passed',mode:'exam'});
      expect(practice.title).not.toBe(exam.title);
      expect(practice.status).not.toBe(exam.status);
    }
  });
  it('shows the six latest actual penalties first without changing the engine history',()=>{
    const events=Array.from({length:8},(_,index)=>({points:index+1,text:`Rule ${index+1}`}));
    const content=examDisplayContent({...state,status:'running',score:135,events});
    expect(content.events.map(event=>event.text)).toEqual(['Rule 8','Rule 7','Rule 6','Rule 5','Rule 4','Rule 3']);
    expect(content.events[0].points).toBe('+8');
    expect(events[0].text).toBe('Rule 1');
    expect(content.points).toBe('135');
  });
  it('keeps the upload content stable within the same simulation second and handles invalid clocks',()=>{
    expect(examDisplayContent({...state,elapsed:65.01})).toEqual(examDisplayContent({...state,elapsed:65.99}));
    expect(formatExamDisplayTime(3601)).toBe('60:01');
    expect(formatExamDisplayTime(-10)).toBe('00:00');
    expect(formatExamDisplayTime(NaN)).toBe('00:00');
  });
});
