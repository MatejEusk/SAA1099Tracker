import { Dispatch } from "redux";
import { actionToast } from "./toast";
import { ReducerStoreState } from "../reducers/index";
import { devLog } from "../utils/dev";

export const enum TrackerAction {
	Init = 'tracker/init',
	IoDemosongLoaded = 'tracker/io/demosongLoaded',
};

export interface TrackerReducerAction {
	type: TrackerAction;
	payload?: any;
}

//---------------------------------------------------------------------------------------

export const actionTrackerInit = (): TrackerReducerAction => ({
	type: TrackerAction.Init
});

export const actionTrackerLoadDemosong = (songName: string, url: string) =>
	(dispatch: Dispatch, getState: () => ReducerStoreState) => {
		const { tracker } = getState();

		devLog(`Loading demosong: "${songName}"...`);

		return fetch(url)
			.then(response => response.json())
			.then(data => {
				if (!tracker.file.parseJSON(data)) {
					throw new Error('Demosong parse error or invalid data format!');
				}

				dispatch({ type: TrackerAction.IoDemosongLoaded });
				dispatch(actionToast({
					icon: 'endorsed',
					intent: 'success',
					message: `Demosong "${songName}" successfully loaded!`
				}));
			})
			.catch(({ message }) => {
				dispatch(actionToast({
					intent: 'danger',
					message
				}))
			});
	};
