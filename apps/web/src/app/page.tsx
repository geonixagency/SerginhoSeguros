import { Site } from "@/components/site/site";

/** Roda antes da pintura: esconde a abertura se já foi vista nesta sessão ou se o usuário reduz movimento. */
const INTRO_BOOT = `try{if(sessionStorage.getItem("ss-intro")==="1"||matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("ss-intro-seen")}catch(e){}`;

export default function HomePage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: INTRO_BOOT }} />
      <Site />
    </>
  );
}
