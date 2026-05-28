import type { TileCode } from './tiles';
import { doraFromIndicator } from './tiles';
import type { GameTile } from './tiles';

interface WinCheckInput {
	handCodes: TileCode[]; // closed tiles (14 for closed hand, fewer with melds)
	openMelds: TileCode[][];
	doraIndicators: GameTile[];
	isRiichi: boolean;
	isTsumo: boolean;
	afterKan?: boolean;
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

// Yaku ID to display name mapping (subset of common yaku)
const YAKU_NAMES: Record<string, string> = {
	'0': 'Riichi',
	'1': 'Ippeiko',
	'2': 'Tanyao',
	'3': 'Pinfu',
	'4': 'Menzen Tsumo',
	'5': 'Iipeiko',
	'6': 'Chanta',
	'7': 'Chiitoi',
	'8': 'Toitoi',
	'9': 'Sanankou',
	'10': 'San Kantsu',
	'11': 'Shousangen',
	'12': 'Honitsu',
	'13': 'Junchan',
	'14': 'Ryanpeiko',
	'15': 'Chinitsu',
	'16': 'Kokushi',
	'17': 'Suuankou',
	'18': 'Daisangen',
	'19': 'Shousuushii',
	'20': 'Daisuushii',
	'21': 'Tsuuiisou',
	'22': 'Chinroutou',
	'23': 'Ryuuiisou',
	'24': 'Chuuren',
	'25': 'Suukantsu',
	'26': 'Tenhou',
	'27': 'Chiihou',
	'28': 'Haku',
	'29': 'Hatsu',
	'30': 'Chun',
	'31': 'East',
	'32': 'South',
	'33': 'West',
	'34': 'North',
	'35': 'Double Riichi',
	'36': 'Ippatsu',
	'37': 'Haitei',
	'38': 'Houtei',
	'39': 'Rinshan',
	'40': 'Chankan',
	'53': 'Dora'
};

export async function checkWin(input: WinCheckInput): Promise<WinResult> {
	try {
		const { calc } = await import('riichi-rs-bundlers');

		const actualDora = input.doraIndicators.map((t) => doraFromIndicator(t.code));

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result: any = (calc as any)({
			closed_part: input.handCodes,
			open_part: input.openMelds,
			options: {
				dora: actualDora,
				aka_count: 0,
				riichi: input.isRiichi,
				ippatsu: false,
				double_riichi: false,
				after_kan: input.afterKan ?? false,
				first_take: false,
				tile_discarded_by_someone: input.isTsumo ? -1 : (input.ronTileCode ?? -1),
				bakaze: input.roundWind,
				jikaze: input.seatWind,
				allow_aka: false,
				allow_kuitan: true,
				with_kiriage: false,
				disabled_yaku: [],
				local_yaku_enabled: [],
				all_local_yaku_enabled: false,
				allow_double_yakuman: false,
				last_tile: false
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
