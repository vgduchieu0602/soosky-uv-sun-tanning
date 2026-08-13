export default class SkinScanRequestError extends Error {
    public constructor () {
        super("The uploaded skin scan image is invalid.");
        this.name = "SkinScanRequestError";
    }
}
