// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ExecutionActivity} from '../src/modules/execution/ExecutionActivity';
import {calendarDays,dateLabel,localDay,durationLabel,type Activity} from '../src/modules/execution/activity';
import {shareCardData} from '../src/modules/execution/share-image';
import type {Execution} from '../src/modules/execution/api';
const mocks=vi.hoisted(()=>({getActivity:vi.fn(),getExecution:vi.fn()}));
vi.mock('../src/modules/execution/activity',async original=>({...await original<object>(),getActivity:mocks.getActivity}));
vi.mock('../src/modules/execution/api',async original=>({...await original<object>(),getExecution:mocks.getExecution}));
const entry={id:'entry',position:1,label:'Treino A',workout_id:'w',workout_version:1,workout:{name:'Prescrição histórica',instructions:'Respire',items:[]}};
const closed:Execution={id:'id',student_id:'s',program_id:'p',program_version:2,workout_version:1,status:'completed',difficulty:'balanced',feedback:'SEGREDO PRIVADO',duration_seconds:125,performed_on:'2024-02-29',version:2,started_at:'2024-03-01T02:58:00Z',ended_at:'2024-03-01T03:00:05Z',snapshot:{program_name:'Programa original',program_start_date:'2024-01-01',entry},items:[],summary:null};
function report():Activity{return {today:'2024-03-01',month:'2024-02-01',page:0,days:[{day:'2024-02-29',total:1,completed:1}],history:[{id:'id',started_at:closed.started_at,ended_at:closed.ended_at!,performed_on:'2024-02-29',duration_seconds:125,status:'completed',difficulty:'balanced',feedback:'SEGREDO PRIVADO',program_name:'Programa original',workout_name:'Prescrição histórica',label:'Treino A',program_version:2,workout_version:1}],stats:{total:21,completed:20,not_completed:1,duration_seconds:2500,average_seconds:119,week:1,month:1,month_completed:1,month_not_completed:0,easy:0,balanced:1,hard:0,unrated:20}};}
beforeEach(()=>{mocks.getActivity.mockResolvedValue(report());mocks.getExecution.mockResolvedValue(closed);});afterEach(()=>{cleanup();vi.resetAllMocks();});
it('uses São Paulo dates and leap-year calendar without inventing streaks',()=>{
 expect(localDay(new Date('2024-03-01T02:59:00Z'))).toBe('2024-02-29');expect(dateLabel('2024-02-29')).toBe('29/02/2024');expect(calendarDays('2024-02')).toEqual({offset:3,count:29});expect(durationLabel(3660)).toBe('1 h 1 min');
});
it('opens the historical snapshot, paginates and does not show private feedback in the student list',async()=>{
 const user=userEvent.setup();render(<ExecutionActivity studentId="s"/>);await screen.findByText('Seu histórico · mais recentes primeiro');expect(screen.queryByText('SEGREDO PRIVADO')).toBeNull();await user.click(screen.getByRole('button',{name:'Mais antigos'}));await waitFor(()=>expect(mocks.getActivity).toHaveBeenLastCalledWith('s',expect.any(String),1));await user.click(screen.getByRole('button',{name:'Ver treino e prescrição original'}));await screen.findByText('SEGREDO PRIVADO');expect(mocks.getExecution).toHaveBeenCalledWith('id');expect(screen.getByText(/programação versão 2/)).toBeTruthy();expect(screen.queryByRole('button',{name:'Finalizar treino'})).toBeNull();
});
it('shows recent private feedback only in authorized coach view and excludes sharing there',async()=>{
 const user=userEvent.setup();render(<ExecutionActivity studentId="s" admin/>);await screen.findByText('FEEDBACK RECENTE');expect(screen.getByText('SEGREDO PRIVADO')).toBeTruthy();await user.click(screen.getByRole('button',{name:'Ver treino e prescrição original'}));await screen.findByText('Treino salvo no seu histórico.');expect(screen.queryByRole('button',{name:'Gerar card do treino'})).toBeNull();
});
it('distinguishes errors and empty history and provides retry',async()=>{
 const user=userEvent.setup();mocks.getActivity.mockRejectedValueOnce(new Error('Falha de conexão'));render(<ExecutionActivity studentId="s"/>);await screen.findByRole('alert');expect(screen.queryByText('Nenhum treino finalizado ainda.')).toBeNull();const empty=report();empty.history=[];empty.stats.total=0;mocks.getActivity.mockResolvedValue(empty);await user.click(screen.getByRole('button',{name:'Atualizar histórico'}));await screen.findByText('Nenhum treino finalizado ainda.');
});
it('whitelists share data and rejects unfinished workouts',()=>{
 const model=shareCardData(closed);expect(Object.keys(model).sort()).toEqual(['brand','name','date','duration','status','difficulty','phrase'].sort());expect(JSON.stringify(model)).not.toContain('SEGREDO');expect(JSON.stringify(model)).not.toContain('Programa original');expect(model.date).toBe('29/02/2024');expect(()=>shareCardData({...closed,status:'not_completed'})).toThrow();
});
