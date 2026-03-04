<?php
/**
 * Event buffer using WordPress transients with lock protection.
 *
 * @package Ailabsaudit_Tracker
 * @license GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Ailabsaudit_Buffer {

	const TRANSIENT_KEY = 'ailabsaudit_event_buffer';
	const LOCK_KEY      = 'ailabsaudit_buffer_lock';
	const MAX_SIZE      = 500;
	const TTL           = 600; // 10 minutes.
	const LOCK_TTL      = 5;   // Lock timeout in seconds.

	/**
	 * Add an event to the buffer. Auto-flushes if buffer exceeds MAX_SIZE.
	 *
	 * @param array $event Event data.
	 */
	public static function add( array $event ) {
		if ( ! self::acquire_lock() ) {
			return;
		}

		$buffer   = get_transient( self::TRANSIENT_KEY );
		$buffer   = is_array( $buffer ) ? $buffer : array();
		$buffer[] = $event;

		// Hard cap to prevent unbounded growth.
		if ( count( $buffer ) > self::MAX_SIZE ) {
			$buffer = array_slice( $buffer, -self::MAX_SIZE );
		}

		set_transient( self::TRANSIENT_KEY, $buffer, self::TTL );
		self::release_lock();

		if ( count( $buffer ) >= self::MAX_SIZE ) {
			Ailabsaudit_Sender::flush();
		}
	}

	/**
	 * Retrieve all buffered events and clear the buffer atomically.
	 *
	 * @return array
	 */
	public static function get_and_clear() {
		if ( ! self::acquire_lock() ) {
			return array();
		}

		$buffer = get_transient( self::TRANSIENT_KEY );
		if ( ! is_array( $buffer ) || empty( $buffer ) ) {
			self::release_lock();
			return array();
		}

		delete_transient( self::TRANSIENT_KEY );
		self::release_lock();

		return $buffer;
	}

	/**
	 * Acquire a simple lock via transients.
	 *
	 * @return bool
	 */
	private static function acquire_lock() {
		// Try up to 10 times with 100ms waits.
		for ( $i = 0; $i < 10; $i++ ) {
			if ( false === get_transient( self::LOCK_KEY ) ) {
				set_transient( self::LOCK_KEY, 1, self::LOCK_TTL );
				return true;
			}
			usleep( 100000 ); // 100ms.
		}
		return false;
	}

	/**
	 * Release the lock.
	 */
	private static function release_lock() {
		delete_transient( self::LOCK_KEY );
	}
}
