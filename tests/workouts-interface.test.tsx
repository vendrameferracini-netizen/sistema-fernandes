// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkoutEditor } from '../src/modules/workouts/WorkoutEditor';
import { WorkoutsPage } from '../src/modules/workouts/WorkoutsPage';
const mocks=vi.hoisted(()=>({listExercises:vi.fn(),listWorkouts:vi.fn(),getWorkout:vi.fn(),saveWorkout:vi.fn(),duplicateWorkout:vi.fn()}));
vi.mock('../src/modules/exercises/api',async original=>({...await original<object>(),listExercises:mocks.listExercises}));
vi.mock('../src/modules/workouts/api',()=>mocks);
beforeEach(()=>{
  mocks.listExercises.mockResolvedValue([{id:'ex1',name:'Supino',muscle_group:'Peitoral',equipment:'Halteres'},{id:'ex2',name:'Elevação lateral',muscle_group:'Ombros',equipment:''}]);
});
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('adds library exercises, changes order and prescription, removes only an item and saves',async()=>{
  const user=userEvent.setup();const saved=vi.fn();mocks.saveWorkout.mockResolvedValue(undefined);
  render(<WorkoutEditor onClose={vi.fn()} onSaved={saved}/>);
  await user.type(screen.getByLabelText('Nome do treino'),'Treino A');
  await screen.findByRole('button',{name:'Adicionar Supino'});
  await user.type(screen.getByLabelText('Buscar na biblioteca'),'elevacao');
  expect(screen.queryByRole('button',{name:'Adicionar Supino'})).toBeNull();
  await user.click(screen.getByRole('button',{name:'Adicionar Elevação lateral'}));
  await user.clear(screen.getByLabelText('Buscar na biblioteca'));
  await user.click(screen.getByRole('button',{name:'Adicionar Supino'}));
  await user.click(screen.getByRole('button',{name:'Subir exercício 2'}));
  const first=within(screen.getByRole('group',{name:'1. Supino'}));
  await user.clear(first.getByLabelText('Séries'));await user.type(first.getByLabelText('Séries'),'4');
  await user.clear(first.getByLabelText('Repetições'));await user.type(first.getByLabelText('Repetições'),'8–10');
  await user.type(first.getByLabelText('Orientação do coach (opcional)'),'Controle');
  await user.click(screen.getByRole('button',{name:'Remover exercício 2'}));
  expect(screen.getByRole('button',{name:'Adicionar Elevação lateral'})).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Salvar treino'}));
  await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
  expect(mocks.saveWorkout).toHaveBeenCalledWith(expect.any(String),'Treino A','',[expect.objectContaining({exercise_id:'ex1',sets:4,repetitions:'8–10',rest_seconds:60,coach_notes:'Controle'})],0);
});
it('keeps input and stable target UUID across an uncertain save, and reports library failure',async()=>{
  mocks.saveWorkout.mockRejectedValue(new Error('Não foi possível confirmar o salvamento.'));
  const user=userEvent.setup();render(<WorkoutEditor onClose={vi.fn()} onSaved={vi.fn()}/>);
  await user.type(screen.getByLabelText('Nome do treino'),'Ficha teste');
  await user.click(await screen.findByRole('button',{name:'Adicionar Supino'}));
  await user.click(screen.getByRole('button',{name:'Salvar treino'}));await screen.findByRole('alert');
  expect(screen.getByDisplayValue('Ficha teste')).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Salvar treino'}));
  await waitFor(()=>expect(mocks.saveWorkout).toHaveBeenCalledTimes(2));
  expect(mocks.saveWorkout.mock.calls[0][0]).toBe(mocks.saveWorkout.mock.calls[1][0]);
});
it('lists, searches and duplicates into a new identifier with an explicit copy name',async()=>{
  const source={id:'workout1',name:'Treino A',instructions:'Peito',version:2,updated_at:'date'};
  mocks.listWorkouts.mockResolvedValue([source]);mocks.duplicateWorkout.mockResolvedValue(undefined);
  const user=userEvent.setup();render(<WorkoutsPage/>);
  await screen.findByText('Treino A');
  await user.type(screen.getByLabelText('Buscar treinos'),'pernas');await screen.findByText('Nenhum treino encontrado.');
  await user.clear(screen.getByLabelText('Buscar treinos'));
  await user.click(screen.getByRole('button',{name:'Duplicar Treino A'}));
  await user.clear(screen.getByLabelText('Nome da cópia'));await user.type(screen.getByLabelText('Nome da cópia'),'Treino B');
  await user.click(screen.getByRole('button',{name:'Criar cópia'}));
  await screen.findByText('Cópia criada. Você pode editá-la sem alterar o treino original.');
  expect(mocks.duplicateWorkout).toHaveBeenCalledWith(source,expect.any(String),'Treino B');
  expect(mocks.duplicateWorkout.mock.calls[0][1]).not.toBe(source.id);
});
it('loads existing prescription for editing and keeps errors distinct from an empty list',async()=>{
  mocks.listWorkouts.mockRejectedValueOnce(new Error('Falha de conexão')).mockResolvedValue([{id:'w1',name:'Treino antigo',instructions:'',version:3}]);
  mocks.getWorkout.mockResolvedValue({id:'w1',name:'Treino antigo',instructions:'Geral',version:3,workout_items:[{id:'i1',exercise_id:'ex1',position:1,sets:5,repetitions:'6',rest_seconds:120,coach_notes:'Nota'}]});
  const user=userEvent.setup();render(<WorkoutsPage/>);
  await screen.findByRole('alert');expect(screen.queryByText('Monte seu primeiro treino.')).toBeNull();
  await user.click(screen.getByText('Tentar novamente'));
  await user.click(await screen.findByRole('button',{name:'Editar Treino antigo'}));
  expect(await screen.findByDisplayValue('Geral')).toBeTruthy();
  expect(screen.getByDisplayValue('120')).toBeTruthy();expect(screen.getByDisplayValue('Nota')).toBeTruthy();
});
