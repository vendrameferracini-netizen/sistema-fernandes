// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ProgramManager} from '../src/modules/programs/ProgramManager';
import {StudentProgram} from '../src/modules/programs/StudentProgram';
const mocks=vi.hoisted(()=>({listPrograms:vi.fn(),getProgramRevision:vi.fn(),listProgramRevisions:vi.fn(),saveProgram:vi.fn(),transitionProgram:vi.fn(),listWorkouts:vi.fn()}));
vi.mock('../src/modules/programs/api',async original=>({...await original<object>(),...mocks}));
vi.mock('../src/modules/workouts/api',()=>({listWorkouts:mocks.listWorkouts}));
const active={id:'p1',student_id:'s1',name:'Programa ativo',status:'active',version:2,start_date:'2026-10-01',updated_at:'now'};
const draft={...active,id:'p2',name:'Novo programa',status:'draft',version:1};
const snapshot={name:active.name,start_date:active.start_date,status:'active',entries:[{id:'e1',label:'Treino A',position:1,workout_id:'w1',workout_version:1,workout:{name:'Peito',instructions:'Com controle',items:[{id:'i1',exercise_id:'x1',sets:3,repetitions:'10',rest_seconds:60,coach_notes:'Devagar',exercise:{name:'Supino',instructions:'Orientação',image_path:null,video_url:'https://vimeo.com/123'}}]}}]};
beforeEach(()=>{
 mocks.listPrograms.mockResolvedValue([]);mocks.listWorkouts.mockResolvedValue([{id:'w1',name:'Peito',version:2},{id:'w2',name:'Costas',version:1}]);
 mocks.getProgramRevision.mockResolvedValue({version:2,snapshot});mocks.saveProgram.mockResolvedValue(undefined);mocks.transitionProgram.mockResolvedValue(undefined);
});
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('creates a draft with ordered selected workouts and preserves input on failed save',async()=>{
 const user=userEvent.setup();render(<ProgramManager studentId="s1" studentActive/>);
 await waitFor(()=>expect((screen.getByRole('button',{name:'Nova programação'}) as HTMLButtonElement).disabled).toBe(false));
 await user.click(screen.getByRole('button',{name:'Nova programação'}));
 await user.type(screen.getByLabelText('Nome da programação'),'Ciclo inicial');
 await user.click(await screen.findByRole('button',{name:/Peito.*Adicionar/}));
 await user.click(screen.getByRole('button',{name:/Costas.*Adicionar/}));
 await user.click(screen.getByRole('button',{name:'Subir treino 2'}));
 mocks.saveProgram.mockRejectedValueOnce(new Error('Falha ao confirmar'));
 await user.click(screen.getByRole('button',{name:'Salvar rascunho'}));
 expect(await screen.findByText('Falha ao confirmar')).toBeTruthy();expect(screen.getByDisplayValue('Ciclo inicial')).toBeTruthy();
 const first=mocks.saveProgram.mock.calls[0];expect(first[1]).toBe('s1');expect(first[4].map((e:any)=>e.workout_id)).toEqual(['w2','w1']);expect(first[5]).toBe(0);
 await user.click(screen.getByRole('button',{name:'Salvar rascunho'}));await screen.findByText('Programação salva.');
 expect(mocks.saveProgram.mock.calls[1][0]).toBe(first[0]);
});
it('requires explicit replacement confirmation and passes the active version',async()=>{
 mocks.listPrograms.mockResolvedValue([draft,active]);const user=userEvent.setup();render(<ProgramManager studentId="s1" studentActive/>);
 await user.click(await screen.findByRole('button',{name:'Ativar e substituir atual'}));expect(mocks.transitionProgram).not.toHaveBeenCalled();
 expect(screen.getByText(/Ativar Novo programa e encerrar Programa ativo/)).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Confirmar ativação'}));await waitFor(()=>expect(mocks.transitionProgram).toHaveBeenCalledWith(draft,'activate',active));
});
it('keeps the assigned workout version until the coach explicitly updates it',async()=>{
 mocks.listPrograms.mockResolvedValue([active]);const user=userEvent.setup();render(<ProgramManager studentId="s1" studentActive/>);
 await user.click(await screen.findByRole('button',{name:'Editar programação'}));await screen.findByRole('button',{name:'Usar versão 2'});
 await user.click(screen.getByRole('button',{name:'Salvar programação'}));await waitFor(()=>expect(mocks.saveProgram).toHaveBeenCalled());
 expect(mocks.saveProgram.mock.calls[0][4][0].workout_version).toBe(1);expect(mocks.saveProgram.mock.calls[0][5]).toBe(2);
});
it('shows only assigned read-only content and clears it after ending and refreshing',async()=>{
 mocks.listPrograms.mockResolvedValue([active]);const user=userEvent.setup();render(<StudentProgram studentId="s1"/>);
 await screen.findByText('Programa ativo');expect(mocks.listPrograms).toHaveBeenCalledWith('s1',true);expect(mocks.getProgramRevision).toHaveBeenCalledWith('p1',2);
 await user.click(screen.getByText('Treino A · Peito'));expect(screen.getByRole('heading',{name:'Supino'})).toBeTruthy();expect(screen.getByText(/3 séries/)).toBeTruthy();
 expect(screen.getByRole('link',{name:'Ver vídeo em nova aba'}).getAttribute('href')).toBe('https://vimeo.com/123');
 expect(screen.queryByRole('button',{name:/concluir|executar|iniciar treino/i})).toBeNull();
 mocks.listPrograms.mockResolvedValue([]);await user.click(screen.getByRole('button',{name:'Atualizar programação'}));await screen.findByText('Sua programação está em preparação.');expect(screen.queryByRole('heading',{name:'Supino'})).toBeNull();
});
it('reports loading failures rather than claiming the student has no assignment',async()=>{
 mocks.listPrograms.mockRejectedValue(new Error('offline'));render(<StudentProgram studentId="s1"/>);await screen.findByRole('alert');expect(screen.queryByText('Sua programação está em preparação.')).toBeNull();
});
