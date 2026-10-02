import { beforeEach, expect, it, vi } from 'vitest';
import { validateVideoUrl, type Exercise } from '../src/modules/exercises/api';
import { replaceImage, validateImage } from '../src/modules/exercises/media';
const mocks = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), rpc: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ requireSupabase: () => ({ storage: { from: () => mocks }, rpc: mocks.rpc }) }));
const exercise = { id:'exercise-id',image_path:'exercise-id/old.png',updated_at:'old-version' } as Exercise;
const png = () => new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'image.png', {type:'image/png'});
beforeEach(() => { vi.resetAllMocks(); });
it('accepts generic HTTPS links and rejects script URLs, credentials and malformed input', () => {
  expect(validateVideoUrl(' https://www.youtube.com/watch?v=123 ')).toBe('https://www.youtube.com/watch?v=123');
  expect(validateVideoUrl('https://vimeo.com/123')).toBe('https://vimeo.com/123');
  expect(validateVideoUrl('')).toBe('');
  for (const url of ['javascript:alert(1)','data:text/html,Hi','http://example.com','https://user:password@example.com','https://example.com\\evil','https://example.com/a b']) expect(() => validateVideoUrl(url)).toThrow();
});
it('rejects videos, spoofed images, empty and oversized files', async () => {
  expect(await validateImage(png())).toBe('png');
  for (const file of [new File(['video'],'test.mp4',{type:'video/mp4'}), new File(['not png'],'fake.png',{type:'image/png'}), new File([],'empty.png',{type:'image/png'}), new File([new Uint8Array(5242881)],'large.png',{type:'image/png'})]) await expect(validateImage(file)).rejects.toThrow();
});
it('uploads before linking and removes the previous image only after commit', async () => {
  const events: string[] = [];
  mocks.upload.mockImplementation(async () => { events.push('upload'); return {error:null}; });
  mocks.rpc.mockImplementation(async (name) => { if(name==='exercise_image_is_retained')return {data:false,error:null}; events.push('link'); return {data:'new-version',error:null}; });
  mocks.remove.mockImplementation(async () => { events.push('cleanup'); return {data:[{name:exercise.image_path}],error:null}; });
  const result = await replaceImage(png(),exercise);
  expect(events).toEqual(['upload','link','cleanup']);
  expect(result.updatedAt).toBe('new-version'); expect(result.unusedPath).toBeNull();
  expect(mocks.rpc).toHaveBeenCalledWith('set_exercise_image',expect.objectContaining({expected_path:exercise.image_path,expected_updated_at:'old-version'}));
});
it('preserves the old image if upload or confirmation fails', async () => {
  mocks.upload.mockResolvedValueOnce({error:{message:'failed'}});
  await expect(replaceImage(png(),exercise)).rejects.toThrow();
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.upload.mockResolvedValue({error:null}); mocks.rpc.mockResolvedValue({data:null,error:{code:'40001'}});
  await expect(replaceImage(png(),exercise)).rejects.toThrow('não foi possível confirmar');
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('reports cleanup failure without claiming the new image failed to save', async () => {
  mocks.upload.mockResolvedValue({error:null}); mocks.rpc.mockResolvedValue({data:'new-version',error:null});
  mocks.remove.mockResolvedValue({error:{message:'offline'}});
  expect((await replaceImage(png(),exercise)).unusedPath).toBe(exercise.image_path);
});
it('keeps retained images without reporting cleanup failure',async()=>{
 mocks.upload.mockResolvedValue({error:null});
 mocks.rpc.mockImplementation(async name=>({data:name==='exercise_image_is_retained'?true:'new-version',error:null}));
 const result=await replaceImage(png(),exercise);
 expect(result.unusedPath).toBeNull();expect(mocks.remove).not.toHaveBeenCalled();
});
