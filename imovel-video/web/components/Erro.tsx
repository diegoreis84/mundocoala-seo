export function Erro({ msg }: { msg?: string }) {
  return msg ? <div className="alert err">{msg}</div> : null;
}
