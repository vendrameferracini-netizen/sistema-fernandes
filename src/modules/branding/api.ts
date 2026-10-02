import {requireSupabase} from '../../lib/supabase';
import {validateImage} from '../exercises/media';
export type SharingBrand={image_path:string|null;version:number};
const bucket='institutional-images';
export async function getSharingBrand():Promise<SharingBrand>{
 const {data,error}=await requireSupabase().from('sharing_brand').select('image_path,version').eq('id',true).single();
 if(error||!data)throw new Error('A configuração da foto ainda não está disponível. Confira se a etapa foi habilitada e tente atualizar.');
 return data;
}
export async function getBrandPhoto(path:string){const {data,error}=await requireSupabase().storage.from(bucket).download(path);if(error||!data)throw new Error('Não foi possível carregar a foto institucional.');return data;}
export async function saveBrandPhoto(file:File,brand:SharingBrand){
 const extension=await validateImage(file);const path=`institutional/${crypto.randomUUID()}.${extension}`;const client=requireSupabase();
 const {error}=await client.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});
 if(error)throw new Error('Não foi possível enviar a foto. A imagem anterior foi preservada.');
 const result=await client.rpc('set_sharing_brand',{new_path:path,expected_version:brand.version});
 if(result.error||typeof result.data!=='number')throw new Error('Não foi possível confirmar a substituição. Atualize a configuração antes de tentar novamente.');
 return {image_path:path,version:result.data};
}
