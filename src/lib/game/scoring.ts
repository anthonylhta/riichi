import type { TileCode } from './tiles';
import { doraFromIndicator } from './tiles';
import type { GameTile } from './tiles';

// riichi-rs-bundlers Meld format: [isOpen, tiles]
type RiichiMeld = [boolean, TileCode[]];

interface WinCheckInput {
	handCodes: TileCode[]; // 14 tiles for tsumo (drawn tile in hand); 13 for ron (ron tile goes in ronTileCode)
	openMelds: RiichiMeld[];
	doraIndicators: GameTile[];
	uraDoraIndicators: GameTile[];
	isRiichi: boolean;
	isDoubleRiichi: boolean;
	isIppatsu: boolean;
	isTsumo: boolean;
	afterKan?: boolean;
	firstTake?: boolean; // Tenhou / Chiihou
	lastTile?: boolean; // Haitei / Houtei
	akaCount?: number; // number of red-five (aka dora) tiles in the winning hand
	ronTileCode: TileCode | null;
	seatWind: TileCode;
	roundWind: TileCode;
}

export interface WinResult {
	isWin: boolean;
	han: number;
	fu: number;
	score: number;
	yakuNames: string[];
}

// Yaku IDs from riichi-rs-bundlers type definitions
const YAKU_NAMES: Record<string, string> = {
	'0': 'Kokushi (13-sided)',
	'1': 'Kokushi',
	'2': 'Chuuren (9-sided)',
	'3': 'Chuuren Poutou',
	'4': 'Suuankou Tanki',
	'5': 'Suuankou',
	'6': 'Daisuushi',
	'7': 'Shousuushii',
	'8': 'Daisangen',
	'9': 'Tsuuiisou',
	'10': 'Ryuuiisou',
	'11': 'Chinroutou',
	'12': 'Suukantsu',
	'13': 'Tenhou',
	'14': 'Chiihou',
	'15': 'Renhou',
	'16': 'Daisharin',
	'17': 'Chinitsu',
	'18': 'Honitsu',
	'19': 'Ryanpeikou',
	'20': 'Junchan',
	'21': 'Chanta',
	'22': 'Toitoi',
	'23': 'Honroutou',
	'24': 'Sankantsu',
	'25': 'Shousangen',
	'26': 'Sanshoku Doukou',
	'27': 'Sanankou',
	'28': 'Chiitoitsu',
	'29': 'Double Riichi',
	'30': 'Ittsu',
	'31': 'Sanshoku',
	'32': 'Tanyao',
	'33': 'Pinfu',
	'34': 'Iipeiko',
	'35': 'Menzen Tsumo',
	'36': 'Riichi',
	'37': 'Ippatsu',
	'38': 'Rinshan',
	'39': 'Chankan',
	'40': 'Haitei',
	'41': 'Houtei',
	'42': 'Round Wind (East)',
	'43': 'Round Wind (South)',
	'44': 'Round Wind (West)',
	'45': 'Round Wind (North)',
	'46': 'Seat Wind (East)',
	'47': 'Seat Wind (South)',
	'48': 'Seat Wind (West)',
	'49': 'Seat Wind (North)',
	'50': 'Haku',
	'51': 'Hatsu',
	'52': 'Chun',
	'53': 'Dora',
	'54': 'Ura Dora',
	'55': 'Aka Dora'
};

export async function checkWin(input: WinCheckInput): Promise<WinResult> {
	try {
		const { calc } = await import('riichi-rs-bundlers');

		const actualDora = input.doraIndicators.map((t) => doraFromIndicator(t.code));
		// Ura dora is only revealed on riichi wins; include them in the dora array
		const actualUraDora = input.isRiichi
			? input.uraDoraIndicators.map((t) => doraFromIndicator(t.code))
			: [];

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result: any = (calc as any)({
			closed_part: input.handCodes,
			open_part: input.openMelds,
			options: {
				dora: [...actualDora, ...actualUraDora],
				aka_count: input.akaCount ?? 0,
				riichi: input.isRiichi,
				ippatsu: input.isIppatsu,
				double_riichi: input.isDoubleRiichi,
				after_kan: input.afterKan ?? false,
				first_take: input.firstTake ?? false,
				tile_discarded_by_someone: input.isTsumo ? -1 : (input.ronTileCode ?? -1),
				bakaze: input.roundWind,
				jikaze: input.seatWind,
				allow_aka: true,
				allow_kuitan: true,
				with_kiriage: false,
				disabled_yaku: [],
				local_yaku_enabled: [],
				all_local_yaku_enabled: false,
				allow_double_yakuman: false,
				last_tile: input.lastTile ?? false
			},
			calc_hairi: false
		});

		if (!result.is_agari) {
			return { isWin: false, han: 0, fu: 0, score: 0, yakuNames: [] };
		}

		const yakuNames = Object.entries(result.yaku as Record<string, number>)
			.map(([id]) => YAKU_NAMES[id] ?? `Yaku ${id}`)
			.filter(Boolean);

		return {
			isWin: true,
			han: result.han,
			fu: result.fu,
			score: result.ten,
			yakuNames
		};
	} catch {
		return { isWin: false, han: 0, fu: 0, score: 0, yakuNames: [] };
	}
}
