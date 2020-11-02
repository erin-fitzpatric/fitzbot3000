import ffi from 'ffi-napi';
import ref from 'ref-napi';
import Struct from 'ref-struct-di';
const StructType = Struct(ref);


const IntPtr = ref.refType('int');

const RECT = StructType({
	left: ref.types.long,
	top: ref.types.long,
	right: ref.types.long,
	bottom: ref.types.long,
})

const POINT = StructType({
	x: ref.types.long,
	y: ref.types.long
});


const GUITHREADINFO = StructType({
	cbSize: ref.types.int,
	flags: ref.types.int,
	hwndActive: IntPtr,
	hwndFocus: IntPtr,
	hwndCapture: IntPtr,
	hwndMenuOwner: IntPtr,
	hwndMoveSize: IntPtr,
	hwndCaret: IntPtr,
	rcCaret: RECT
})

//const pGUITHREADINFO = ref.refType(GUITHREADINFO);
//const pPOINT = ref.refType(POINT);


const user32 = ffi.Library("user32", {
	GetGUIThreadInfo: [ref.types.int32, [ref.types.int32, IntPtr]],
	ClientToScreen: [ref.types.int32, [IntPtr, IntPtr]]
})


const kernel32 = ffi.Library("kernel32", {
	GetLastError: [ref.types.int32,[]]
});

export function getCaretPosition() {

	let gtiResult = new GUITHREADINFO();

	gtiResult.cbSize = 72;

	let result = user32.GetGUIThreadInfo(0, gtiResult.ref());

	if (!result)
	{
		console.log(kernel32.GetLastError());
		return null;
	}

	var point = new POINT({x: gtiResult.rcCaret.left, y: gtiResult.rcCaret.top});
	if (!user32.ClientToScreen(gtiResult.hwndCaret, point.ref()))
		return null;

	return [point.x, point.y];
}