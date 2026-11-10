import { describe, expect, it } from 'vitest';
import { course } from '../src/data/course';
import { rules } from '../src/data/rules';
import { defaultBindings } from '../src/simulation/input';
import { copy, hudCopy, label, practiceCopy } from '../src/ui/i18n';

describe('Uzbek and Russian content',()=>{
  it('provides both languages for every exercise and scoring rule',()=>{
    for(const exercise of course.exercises){
      for(const language of ['uz','ru'] as const){
        expect(exercise.name[language].trim(),`${exercise.id} name (${language})`).not.toBe('');
        expect(exercise.instruction[language].trim(),`${exercise.id} instruction (${language})`).not.toBe('');
      }
    }
    for(const rule of rules)for(const language of ['uz','ru'] as const)expect(rule.text[language].trim(),`rule ${rule.id} (${language})`).not.toBe('');
  });
  it('provides matching interface keys and translated names for all configurable controls',()=>{
    for(const group of [copy,hudCopy,practiceCopy]){
      expect(Object.keys(group.uz).sort()).toEqual(Object.keys(group.ru).sort());
      for(const text of Object.values(group.uz))expect(text.trim()).not.toBe('');
      for(const text of Object.values(group.ru))expect(text.trim()).not.toBe('');
    }
    for(const action of Object.keys(defaultBindings))for(const language of ['uz','ru'] as const)expect(label(action,language),`${action} (${language})`).not.toBe(action);
  });
});
