/**
 * Dahili kamu malı Türkçe metinler.
 * Her zaman çalışır — çevrimdışı, ağ gerektirmez.
 * Tanınmış/ezberi kolay eserlerle küçük bir demo katalog.
 */
import { BookSource, BookSearchResult } from './types';

interface BundledBook {
  id: string;
  title: string;
  author: string;
  aliases: string[]; // sesli komutla eşleşmeyi kolaylaştırmak için
  text: string;
}

const BOOKS: BundledBook[] = [
  {
    id: 'istiklal-marsi',
    title: 'İstiklâl Marşı',
    author: 'Mehmet Akif Ersoy',
    aliases: ['istiklal marşı', 'istiklal', 'milli marş', 'türk milli marşı'],
    text: `İstiklâl Marşı

Korkma! Sönmez bu şafaklarda yüzen al sancak,
Sönmeden yurdumun üstünde tüten en son ocak.
O benim milletimin yıldızıdır, parlayacak;
O benimdir, o benim milletimindir ancak.

Çatma, kurban olayım, çehreni ey nazlı hilâl!
Kahraman ırkıma bir gül; ne bu şiddet, bu celâl?
Sana olmaz dökülen kanlarımız sonra helâl...
Hakkıdır, Hakk'a tapan milletimin istiklâl.

Ben ezelden beridir hür yaşadım, hür yaşarım;
Hangi çılgın bana zincir vuracakmış? Şaşarım!
Kükremiş sel gibiyim, bendimi çiğner, aşarım;
Yırtarım dağları, enginlere sığmam, taşarım.

Garbın âfâkını sarmışsa çelik zırhlı duvar;
Benim iman dolu göğsüm gibi serhaddim var.
Ulusun, korkma! Nasıl böyle bir imânı boğar,
"Medeniyet!" dediğin tek dişi kalmış canavar?

Arkadaş! Yurduma alçakları uğratma sakın;
Siper et gövdeni, dursun bu hayâsızca akın.
Doğacaktır sana va'dettiği günler Hakk'ın...
Kim bilir, belki yarın, belki yarından da yakın.

Bastığın yerleri "toprak!" diyerek geçme, tanı:
Düşün altındaki binlerce kefensiz yatanı.
Sen şehid oğlusun, incitme, yazıktır, atanı:
Verme, dünyâları alsan da, bu cennet vatanı.

Kim bu cennet vatanın uğruna olmaz ki fedâ?
Şühedâ fışkıracak toprağı sıksan, şühedâ!
Cânı, cânânı, bütün varımı alsın da Hüdâ,
Etmesin tek vatanımdan beni dünyâda cüdâ.

Rûhumun senden, İlâhi, şudur ancak emeli:
Değmesin ma'bedimin göğsüne nâ-mahrem eli.
Bu ezanlar -ki şehâdetleri dînin temeli-
Ebedî yurdumun üstünde benim inlemeli.

O zaman vecd ile bin secde eder -varsa- taşım,
Her cerîhamdan, İlâhi, boşanıp kanlı yaşım,
Fışkırır rûh-i mücerred gibi yerden na'şım;
O zaman yükselerek arşa değer belki başım.

Dalgalan sen de şafaklar gibi ey şanlı hilâl!
Olsun artık dökülen kanlarımın hepsi helâl.
Ebediyen sana yok, ırkıma yok izmihlâl:
Hakkıdır, hür yaşamış, bayrağımın hürriyet;
Hakkıdır, Hakk'a tapan milletimin istiklâl!`,
  },
  {
    id: 'nasreddin-hoca',
    title: 'Nasreddin Hoca Fıkraları',
    author: 'Halk Edebiyatı',
    aliases: ['nasreddin hoca', 'nasrettin hoca', 'hoca', 'fıkralar', 'nasreddin'],
    text: `Nasreddin Hoca Fıkraları

KAZAN DOĞURDU
Bir gün Hoca komşusundan büyük bir kazan ödünç almış. Birkaç gün sonra kazanla birlikte, içine koyduğu küçük bir kazanı da geri götürmüş.
Komşusu şaşırarak sormuş:
— Bu küçük kazan da ne?
— Sizinki doğurmuş, demiş Hoca. Küçüğünü getirdim.
Komşu, hem gülmüş hem de sevinmiş, küçük kazanı almış.
Bir süre sonra Hoca tekrar kazanı ödünç almış. Fakat bu sefer günler geçmiş, kazan geri gelmemiş. Komşu sormuş:
— Hocam, kazan ne oldu?
— Ah komşu, başın sağ olsun. Kazanınız öldü.
— Olur mu hiç? Hiç kazan ölür mü?
— Doğurduğuna inandın da öldüğüne niçin inanmazsın?

YORGAN GİTTİ, KAVGA BİTTİ
Bir gece Hoca, evinin önünde bir patırtı duymuş. "Acaba ne oluyor?" diye merakla yorganı sırtına almış, dışarı çıkmış. Bir de ne görsün, iki adam birbirine girmiş kavga ediyor. Hoca aralarına girip ayırmaya çalışırken adamlar yorganı kaparak kaçmışlar.
Hoca evine dönmüş, karısı sormuş:
— Hocam, ne oluyordu dışarıda?
— Hiç, demiş Hoca. Yorgan gitti, kavga bitti.

İPE UN SERMEK
Komşusu bir gün Hoca'dan ip istemek için gelmiş. Hoca içeri girip biraz sonra dönmüş:
— Kusura bakma komşu, ipi kullanıyoruz. Hanım ipe un seriyor.
— A Hocam, ipe un serilir mi hiç?
— Vermeye niyetin olmayınca serilir de, demiş Hoca.

PARAYI VEREN DÜDÜĞÜ ÇALAR
Hoca bir gün pazara giderken köylü çocuklar etrafını sarmış. Her biri "Bana oyuncak, bana şeker, bana düdük getir" demiş. Hoca yalnız bir çocuktan para almış. Akşam dönüşte bekleyen çocuklara:
— Parayı veren düdüğü çalar, demiş ve sadece para veren çocuğa düdük uzatmış.

HOCA VE EŞEK
Hoca bir gün çarşıdan dönerken eşeğine ters binmiş. Köylüler:
— Hocam, niçin eşeğe ters biniyorsun? diye sormuşlar.
Hoca şöyle cevap vermiş:
— Ben düz binsem benim sırtım size dönük olacak, siz düz bineydiniz sizin sırtınız bana dönük olacaktı. Bu hâlde birbirimizin yüzünü görüyoruz.

AYIN ON DÖRDÜ
Bir akşam Hoca kuyunun başına gelmiş, suya bakınca ayın kuyunun içine düştüğünü görmüş. "Eyvah, ay kuyuya düşmüş!" demiş. Hemen bir kanca bulup kuyuya sarkıtmış. Kanca taşa takılmış, Hoca bütün gücüyle çekmiş. Birden kanca kurtulmuş, Hoca sırtüstü yere düşmüş. Gözünü açıp gökyüzüne bakmış, ayın yerinde duruduğunu görünce:
— Çok şükür, demiş. Zahmet çektim ama ayı yerine koydum.`,
  },
  {
    id: 'omer-seyfettin-forsa',
    title: 'Forsa',
    author: 'Ömer Seyfettin',
    aliases: ['forsa', 'ömer seyfettin forsa', 'omer seyfettin forsa'],
    text: `Forsa
Ömer Seyfettin

Tekne, dalgaların sırtında bir kuş gibi uçuyordu. Rumeli sahillerinden kalkan bu küçük kadırga, doğruca Sakız'a doğru gidiyordu. Üstü kapalı güvertenin iki tarafında, ellerinde kırbaçla iki zebellah gibi adam duruyor, aşağıda zincire vurulmuş otuz altı forsa, göğüslerini kırbaçların altında gere gere kürek çekiyordu.

Kadırganın en aşağısındaki köşede, saçı sakalı bembeyaz olmuş, yüzü güneşte kavrulmuş, gözleri çukura kaçmış, kemikleri sayılır bir ihtiyar da kürek çekiyordu. Yıllardır zincirdeydi. Daha genç, daha güçlüyken kaçırılmış, kâfire forsalık eder olmuştu. Memleketini, annesini, çocuğunu unutmamıştı. Her gece zincirinin sesiyle uyur, rüyasında evini görür, uyanınca gözyaşı dökerdi.

Bir sabah tekne Sakız'a yaklaştığında fırtına patlak verdi. Dalgalar dağ gibi oldu, direk kırıldı, yelken parçalandı. Kaptan bağırıyor, zebellahlar koşuşuyordu. Birden bir dalga güverteyi yaladı, zincirler koptu, forsalar suya düştü. İhtiyar kendini sahile attı. Kumun üstüne uzanıp kaldı. Gözlerini açtığında, başında küçük bir çocuk duruyordu. Çocuk Türkçe konuşuyordu.

— Amca, kimsin? Nereden geldin?
İhtiyarın gözlerinden yaşlar boşandı. Ellerini açtı, gökyüzüne baktı, titrek sesiyle:
— Oğlum, ben otuz yıl önce bu topraklardan kaçırılmış bir Türk'üm. Şimdi yine geldim. Beni köyüme götür.

Çocuk onu elinden tuttu, köye götürdü. Köylüler toplandı. İhtiyarı yıkadılar, giydirdiler, doyurdular. Ama o hiç konuşmadı. Sabaha karşı, yüzünde bir tebessümle, sessizce gözlerini yumdu. Otuz yıllık hasret, bir gecede son buldu.`,
  },
];

/** Türkçe harfleri sade ASCII'ye indir + küçült: "İstiklâl" → "istiklal" */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/i̇/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ç/g, 'c')
    .replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const bundledSource: BookSource = {
  name: 'bundled',

  async search(query: string): Promise<BookSearchResult[]> {
    const q = normalize(query);
    if (!q) return [];

    const matches = BOOKS.filter((b) => {
      const nTitle = normalize(b.title);
      const nAuthor = normalize(b.author);
      if (nTitle.includes(q) || q.includes(nTitle)) return true;
      if (nAuthor.includes(q)) return true;
      return b.aliases.some((a) => {
        const na = normalize(a);
        return na.includes(q) || q.includes(na);
      });
    });

    console.log(`[bundled] sorgu="${query}" normalize="${q}" eşleşme=${matches.length}`);

    return matches.map((b) => ({
      id: `bundled:${b.id}`,
      title: b.title,
      author: b.author,
      source: 'bundled',
      sourceId: b.id,
    }));
  },

  async fetchText(sourceId: string): Promise<string> {
    const book = BOOKS.find((b) => b.id === sourceId);
    if (!book) throw new Error(`Bundled kitap bulunamadı: ${sourceId}`);
    return book.text;
  },
};

export function listBundledBooks(): BookSearchResult[] {
  return BOOKS.map((b) => ({
    id: `bundled:${b.id}`,
    title: b.title,
    author: b.author,
    source: 'bundled',
    sourceId: b.id,
  }));
}
