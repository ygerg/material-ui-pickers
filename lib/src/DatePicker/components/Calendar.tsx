import * as React from 'react';
import * as PropTypes from 'prop-types';
import Day from './Day';
import DayWrapper from './DayWrapper';
import CalendarHeader from './CalendarHeader';
import SlideTransition, { SlideDirection } from './SlideTransition';
import { Theme } from '@material-ui/core';
import CircularProgress from '@material-ui/core/CircularProgress';
import { runKeyHandler } from '../../_shared/hooks/useKeyDown';
import { MaterialUiPickersDate } from '../../typings/date';
import { IconButtonProps } from '@material-ui/core/IconButton';
import { withStyles, WithStyles } from '@material-ui/core/styles';
import { findClosestEnabledDate } from '../../_helpers/date-utils';
import { withUtils, WithUtilsProps } from '../../_shared/WithUtils';

export interface OutterCalendarProps {
  /** Left arrow icon */
  leftArrowIcon?: React.ReactNode;
  /** Right arrow icon */
  rightArrowIcon?: React.ReactNode;
  /** Custom renderer for day */
  renderDay?: (
    day: MaterialUiPickersDate,
    selectedDate: MaterialUiPickersDate,
    dayInCurrentMonth: boolean,
    dayComponent: JSX.Element
  ) => JSX.Element;
  /**
   * Enables keyboard listener for moving between days in calendar
   * @default true
   */
  allowKeyboardControl?: boolean;
  /**
   * Props to pass to left arrow button
   * @type {Partial<IconButtonProps>}
   */
  leftArrowButtonProps?: Partial<IconButtonProps>;
  /**
   * Props to pass to right arrow button
   * @type {Partial<IconButtonProps>}
   */
  rightArrowButtonProps?: Partial<IconButtonProps>;
  /** Disable specific date */
  shouldDisableDate?: (day: MaterialUiPickersDate) => boolean;
  /** Callback firing on month change */
  onMonthChange?: (date: MaterialUiPickersDate) => void | Promise<void>;
  /** Custom loading indicator  */
  loadingIndicator?: JSX.Element;
}

export interface CalendarProps
  extends OutterCalendarProps,
    WithUtilsProps,
    WithStyles<typeof styles, true> {
  /** Calendar Date */
  date: MaterialUiPickersDate;
  /** Calendar onChange */
  onChange: (date: MaterialUiPickersDate, isFinish?: boolean) => void;
  /** Min date */
  minDate?: MaterialUiPickersDate;
  /** Max date */
  maxDate?: MaterialUiPickersDate;
  /** Disable past dates */
  disablePast?: boolean;
  /** Disable future dates */
  disableFuture?: boolean;
}

export interface CalendarState {
  slideDirection: SlideDirection;
  currentMonth: MaterialUiPickersDate;
  lastDate?: MaterialUiPickersDate;
  loadingQueue: number;
}

const KeyDownListener = ({ onKeyDown }: { onKeyDown: (e: KeyboardEvent) => void }) => {
  React.useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onKeyDown]);

  return null;
};

export class Calendar extends React.Component<CalendarProps, CalendarState> {
  public static propTypes: any = {
    renderDay: PropTypes.func,
    shouldDisableDate: PropTypes.func,
    allowKeyboardControl: PropTypes.bool,
  };

  public static defaultProps: Partial<CalendarProps> = {
    minDate: new Date('1900-01-01'),
    maxDate: new Date('2100-01-01'),
    disablePast: false,
    disableFuture: false,
    allowKeyboardControl: true,
  };

  public static getDerivedStateFromProps(nextProps: CalendarProps, state: CalendarState) {
    const { utils, date: nextDate } = nextProps;

    if (!utils.isEqual(nextDate, state.lastDate)) {
      const nextMonth = utils.getMonth(nextDate);
      const lastDate = state.lastDate || nextDate;
      const lastMonth = utils.getMonth(lastDate);

      return {
        lastDate: nextDate,
        currentMonth: nextProps.utils.startOfMonth(nextDate),
        // prettier-ignore
        slideDirection: nextMonth === lastMonth
          ? state.slideDirection
          : utils.isAfterDay(nextDate, lastDate)
            ? 'left'
            : 'right'
      };
    }

    return null;
  }

  public state: CalendarState = {
    slideDirection: 'left',
    currentMonth: this.props.utils.startOfMonth(this.props.date),
    loadingQueue: 0,
  };

  public componentDidMount() {
    const { date, minDate, maxDate, utils, disablePast, disableFuture } = this.props;

    if (this.shouldDisableDate(date)) {
      const closestEnabledDate = findClosestEnabledDate({
        date,
        utils,
        minDate: utils.date(minDate),
        maxDate: utils.date(maxDate),
        disablePast: Boolean(disablePast),
        disableFuture: Boolean(disableFuture),
        shouldDisableDate: this.shouldDisableDate,
      });

      this.onDateSelect(closestEnabledDate, false);
    }
  }

  public onDateSelect = (day: MaterialUiPickersDate, isFinish = true) => {
    const { date, utils } = this.props;

    this.props.onChange(utils.mergeDateAndTime(day, date), isFinish);
  };

  public handleChangeMonth = (newMonth: MaterialUiPickersDate, slideDirection: SlideDirection) => {
    this.setState({ currentMonth: newMonth, slideDirection });

    if (this.props.onMonthChange) {
      const returnVal = this.props.onMonthChange(newMonth);
      if (returnVal) {
        this.pushToLoadingQueue();
        returnVal.then(() => {
          this.popFromLoadingQueue();
        });
      }
    }
  };

  public validateMinMaxDate = (day: MaterialUiPickersDate) => {
    const { minDate, maxDate, utils, disableFuture, disablePast } = this.props;
    const now = utils.date();

    return Boolean(
      (disableFuture && utils.isAfterDay(day, now)) ||
        (disablePast && utils.isBeforeDay(day, now)) ||
        (minDate && utils.isBeforeDay(day, utils.date(minDate))) ||
        (maxDate && utils.isAfterDay(day, utils.date(maxDate)))
    );
  };

  public shouldDisablePrevMonth = () => {
    const { utils, disablePast, minDate } = this.props;

    const now = utils.date();
    const firstEnabledMonth = utils.startOfMonth(
      disablePast && utils.isAfter(now, utils.date(minDate)) ? now : utils.date(minDate)
    );

    return !utils.isBefore(firstEnabledMonth, this.state.currentMonth);
  };

  public shouldDisableNextMonth = () => {
    const { utils, disableFuture, maxDate } = this.props;

    const now = utils.date();
    const lastEnabledMonth = utils.startOfMonth(
      disableFuture && utils.isBefore(now, utils.date(maxDate)) ? now : utils.date(maxDate)
    );

    return !utils.isAfter(lastEnabledMonth, this.state.currentMonth);
  };

  public shouldDisableDate = (day: MaterialUiPickersDate) => {
    const { shouldDisableDate } = this.props;

    return this.validateMinMaxDate(day) || Boolean(shouldDisableDate && shouldDisableDate(day));
  };

  public moveToDay = (day: MaterialUiPickersDate) => {
    if (day && !this.shouldDisableDate(day)) {
      this.onDateSelect(day, false);
    }
  };

  public handleKeyDown = (event: KeyboardEvent) => {
    const { theme, date, utils } = this.props;

    runKeyHandler(event, {
      ArrowUp: () => this.moveToDay(utils.addDays(date, -7)),
      ArrowDown: () => this.moveToDay(utils.addDays(date, 7)),
      ArrowLeft: () => this.moveToDay(utils.addDays(date, theme.direction === 'ltr' ? -1 : 1)),
      ArrowRight: () => this.moveToDay(utils.addDays(date, theme.direction === 'ltr' ? 1 : -1)),
    });
  };

  public renderWeeks = () => {
    const { utils, classes } = this.props;
    const weeks = utils.getWeekArray(this.state.currentMonth);

    return weeks.map(week => (
      <div key={`week-${week[0]!.toString()}`} className={classes.week}>
        {this.renderDays(week)}
      </div>
    ));
  };

  public renderDays = (week: MaterialUiPickersDate[]) => {
    const { date, renderDay, utils } = this.props;

    const now = utils.date();
    const selectedDate = utils.startOfDay(date);
    const currentMonthNumber = utils.getMonth(this.state.currentMonth);

    return week.map(day => {
      const disabled = this.shouldDisableDate(day);
      const isDayInCurrentMonth = utils.getMonth(day) === currentMonthNumber;

      let dayComponent = (
        <Day
          disabled={disabled}
          current={utils.isSameDay(day, now)}
          hidden={!isDayInCurrentMonth}
          selected={utils.isSameDay(selectedDate, day)}
        >
          {utils.getDayText(day)}
        </Day>
      );

      if (renderDay) {
        dayComponent = renderDay(day, selectedDate, isDayInCurrentMonth, dayComponent);
      }

      return (
        <DayWrapper
          value={day}
          key={day!.toString()}
          disabled={disabled}
          dayInCurrentMonth={isDayInCurrentMonth}
          onSelect={this.onDateSelect}
        >
          {dayComponent}
        </DayWrapper>
      );
    });
  };

  public render() {
    const { currentMonth, slideDirection } = this.state;
    const {
      classes,
      allowKeyboardControl,
      leftArrowButtonProps,
      leftArrowIcon,
      rightArrowButtonProps,
      rightArrowIcon,
      loadingIndicator,
    } = this.props;
    const loadingElement = loadingIndicator ? loadingIndicator : <CircularProgress />;

    return (
      <React.Fragment>
        {allowKeyboardControl && <KeyDownListener onKeyDown={this.handleKeyDown} />}

        <CalendarHeader
          currentMonth={currentMonth!}
          slideDirection={slideDirection}
          onMonthChange={this.handleChangeMonth}
          leftArrowIcon={leftArrowIcon}
          leftArrowButtonProps={leftArrowButtonProps}
          rightArrowIcon={rightArrowIcon}
          rightArrowButtonProps={rightArrowButtonProps}
          disablePrevMonth={this.shouldDisablePrevMonth()}
          disableNextMonth={this.shouldDisableNextMonth()}
        />

        <SlideTransition
          slideDirection={slideDirection}
          transKey={currentMonth!.toString()}
          className={classes.transitionContainer}
        >
          <>
            {(this.state.loadingQueue > 0 && (
              <div className={classes.progressContainer}>{loadingElement}</div>
            )) || <div>{this.renderWeeks()}</div>}
          </>
        </SlideTransition>
      </React.Fragment>
    );
  }

  public pushToLoadingQueue = () => {
    const loadingQueue = this.state.loadingQueue + 1;
    this.setState({ loadingQueue });
  };

  public popFromLoadingQueue = () => {
    let loadingQueue = this.state.loadingQueue;
    loadingQueue = loadingQueue <= 0 ? 0 : loadingQueue - 1;
    this.setState({ loadingQueue });
  };
}

export const styles = (theme: Theme) => ({
  transitionContainer: {
    minHeight: 36 * 6,
    marginTop: theme.spacing(1.5),
  },
  progressContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  week: {
    display: 'flex',
    justifyContent: 'center',
  },
});

export default withStyles(styles, {
  name: 'MuiPickersCalendar',
  withTheme: true,
})(withUtils()(Calendar));
