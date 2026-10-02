import { requireSupabase } from '../../lib/supabase';
import type { Difficulty, Execution } from './api';
export const difficultyLabels:Record<Difficulty,string>={easy:'Fácil',balanced:'Na medida',hard:'Difícil'};
export const outcomeLabel=(status:string)=>status==='completed'?'Concluído':'Não concluído';
export function localDay(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function dateLabel(day:string){return new Date(day+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC'});}
export function durationLabel(seconds:number){const minutes=Math.floor(seconds/60);return minutes>=60?`${Math.floor(minutes/60)} h ${minutes%60} min`:`${minutes} min ${Math.floor(seconds%60)} s`;}
export type ActivityRow={id:string;started_at:string;ended_at:string;performed_on:string;duration_seconds:number;status:Execution['status'];difficulty:Difficulty|null;feedback:string|null;program_name:string;workout_name:string;label:string;program_version:number;workout_version:number};
export type Activity={today:string;month:string;page:number;history:ActivityRow[];days:{day:string;total:number;completed:number}[];stats:{total:number;completed:number;not_completed:number;duration_seconds:number;average_seconds:number;week:number;month:number;month_completed:number;month_not_completed:number;easy:number;balanced:number;hard:number;unrated:number}};
export async function getActivity(student:string,month:string,page=0):Promise<Activity>{
 const {data,error}=await requireSupabase().rpc('execution_activity',{student,month_start:month+'-01',page});
 if(error||!data)throw new Error('Não foi possível carregar o acompanhamento. Tente novamente.');return data as Activity;
}
export function calendarDays(month:string){const [y,m]=month.split('-').map(Number);return {offset:(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7,count:new Date(Date.UTC(y,m,0)).getUTCDate()};}
