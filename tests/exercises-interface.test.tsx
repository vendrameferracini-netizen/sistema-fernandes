// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExercisesPage } from '../src/modules/exercises/ExercisesPage';
const mocks = vi.hoisted(() => ({ listExercises: vi.fn(), saveExercise: vi.fn() }));
vi.mock('../src/modules/exercises/api', async importOriginal => ({ ...await importOriginal<object>(), ...mocks }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('searches without accents, edits existing values and preserves input on failure', async () => {
  mocks.listExercises.mockResolvedValue([{id:'one',name:'Elevação lateral',muscle_group:'Ombros',equipment:'Halteres',instructions:'Controle o movimento',updated_at:'date'}]);
  mocks.saveExercise.mockRejectedValue(new Error('Falha ao salvar'));
  const user = userEvent.setup(); render(<ExercisesPage />);
  await screen.findByText('Elevação lateral');
  await user.type(screen.getByLabelText('Buscar exercícios'),'elevacao');
  expect(screen.getByText('Elevação lateral')).toBeTruthy();
  await user.click(screen.getByText('Elevação lateral'));
  expect((screen.getByLabelText('Nome do exercício') as HTMLInputElement).value).toBe('Elevação lateral');
  await user.click(screen.getByText('Salvar alterações'));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByDisplayValue('Controle o movimento')).toBeTruthy();
  mocks.saveExercise.mockResolvedValue(undefined);
  await user.click(screen.getByText('Salvar alterações'));
  await screen.findByText('Exercício atualizado.');
});
it('creates an exercise and distinguishes loading failure from an empty library', async () => {
  mocks.listExercises.mockRejectedValueOnce(new Error('Network')).mockResolvedValue([]);
  mocks.saveExercise.mockResolvedValue(undefined);
  const user = userEvent.setup(); render(<ExercisesPage />);
  await screen.findByRole('alert');
  expect(screen.queryByText('Sua biblioteca começa aqui.')).toBeNull();
  await user.click(screen.getByText('Tentar novamente'));
  await screen.findByText('Sua biblioteca começa aqui.');
  await user.click(screen.getByText('Novo exercício'));
  await user.type(screen.getByLabelText('Nome do exercício'),'Agachamento');
  await user.type(screen.getByLabelText('Grupo muscular'),'Quadríceps');
  await user.click(screen.getByText('Cadastrar exercício'));
  await waitFor(() => expect(mocks.saveExercise).toHaveBeenCalledWith({name:'Agachamento',muscle_group:'Quadríceps',equipment:'',instructions:'',video_url:''},undefined));
  await screen.findByText('Exercício cadastrado.');
});
